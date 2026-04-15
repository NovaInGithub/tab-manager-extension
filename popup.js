class TabManager {
  constructor() {
    this.tabs = [];
    this.domainGroups = {};
    this.recentlyClosed = [];
    this.init();
  }

  async init() {
    await this.fetchTabs();
    this.groupTabsByDomain();
    this.detectDuplicateTabs();
    this.renderTabs();
  }

  async fetchTabs() {
    this.tabs = await chrome.tabs.query({ currentWindow: true });
  }

  getDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.startsWith('www.') ? domain.slice(4) : domain;
    } catch {
      return 'Unknown';
    }
  }

  groupTabsByDomain() {
    this.domainGroups = {};
    this.tabs.forEach(tab => {
      const domain = this.getDomain(tab.url);
      if (!this.domainGroups[domain]) {
        this.domainGroups[domain] = [];
      }
      this.domainGroups[domain].push(tab);
    });
  }

  detectDuplicateTabs() {
    const urlMap = {};
    this.tabs.forEach(tab => {
      if (urlMap[tab.url]) {
        urlMap[tab.url].push(tab);
      } else {
        urlMap[tab.url] = [tab];
      }
    });

    this.duplicateTabs = Object.values(urlMap).filter(tabs => tabs.length > 1);
  }

  getFavicon(url) {
    try {
      const domain = new URL(url).origin;
      return `${domain}/favicon.ico`;
    } catch {
      return '';
    }
  }

  getDomainColor(domain) {
    const colors = [
      '#4285F4', '#EA4335', '#FBBC05', '#34A853',
      '#9C27B0', '#FF9800', '#795548', '#607D8B'
    ];
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';

    if (this.duplicateTabs.length > 0) {
      this.renderDuplicateWarning();
    }

    Object.entries(this.domainGroups).forEach(([domain, tabs]) => {
      const groupElement = this.createDomainGroup(domain, tabs);
      container.appendChild(groupElement);
    });
  }

  renderDuplicateWarning() {
    const container = document.getElementById('tabs-container');
    const warningElement = document.createElement('div');
    warningElement.className = 'duplicate-warning';
    warningElement.innerHTML = `
      <div>发现重复标签页，是否关闭重复页面？</div>
      <div class="duplicate-actions">
        <button id="close-all-duplicates">关闭所有重复</button>
        <button id="ignore-duplicates">忽略</button>
      </div>
    `;
    container.appendChild(warningElement);

    document.getElementById('close-all-duplicates').addEventListener('click', () => {
      this.closeDuplicateTabs();
    });

    document.getElementById('ignore-duplicates').addEventListener('click', () => {
      warningElement.remove();
    });
  }

  closeDuplicateTabs() {
    this.duplicateTabs.forEach(tabs => {
      tabs.slice(1).forEach(tab => {
        chrome.tabs.remove(tab.id);
      });
    });
    this.showToast('已关闭所有重复标签页');
    this.init();
  }

  createDomainGroup(domain, tabs) {
    const groupElement = document.createElement('div');
    groupElement.className = 'domain-group';

    const color = this.getDomainColor(domain);
    groupElement.style.borderLeft = `4px solid ${color}`;

    const header = document.createElement('div');
    header.className = 'domain-header';
    header.style.backgroundColor = color;
    header.innerHTML = `
      <span>${domain} (${tabs.length})</span>
    `;

    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'domain-tabs';
    tabsContainer.dataset.domain = domain;

    tabs.forEach(tab => {
      const tabElement = this.createTabItem(tab);
      tabsContainer.appendChild(tabElement);
    });

    groupElement.appendChild(header);
    groupElement.appendChild(tabsContainer);

    return groupElement;
  }

  createTabItem(tab) {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab-item';
    tabElement.dataset.tabId = tab.id;

    const favicon = this.getFavicon(tab.url);
    tabElement.innerHTML = `
      <img class="tab-favicon" src="${favicon}" alt="favicon">
      <span class="tab-title">${tab.title}</span>
      <div class="tab-close" data-tab-id="${tab.id}">×</div>
    `;

    tabElement.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        chrome.tabs.update(tab.id, { active: true });
      }
    });

    tabElement.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    return tabElement;
  }

  closeTab(tabId) {
    chrome.tabs.get(tabId, (tab) => {
      this.recentlyClosed.unshift(tab);
      chrome.tabs.remove(tabId, () => {
        this.showToast('如果是不小心关闭该页面，可以点击撤销', true);
        this.init();
      });
    });
  }

  undoClose() {
    if (this.recentlyClosed.length > 0) {
      const tab = this.recentlyClosed.shift();
      chrome.tabs.create({
        url: tab.url,
        active: true,
        index: tab.index
      });
      this.showToast('已恢复最近关闭的标签页');
      this.init();
    }
  }

  showToast(message, showUndo = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span>${message}</span>
      ${showUndo ? '<span class="toast-undo" id="undo-close">撤销</span>' : ''}
    `;
    container.appendChild(toast);

    if (showUndo) {
      document.getElementById('undo-close').addEventListener('click', () => {
        this.undoClose();
        toast.remove();
      });
    }

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 初始化标签页管理器
new TabManager();