/**
 * Sidebar Component - Renders the application sidebar
 * Auto-detects current page from URL and sets active state
 */
class Sidebar {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.menuItems = [
            {
                section: 'الرئيسية',
                items: [
                    { href: 'dashboard.html', icon: 'fas fa-home', text: 'لوحة التحكم' }
                ]
            },
            {
                section: 'الحركات',
                items: [
                    { href: 'supply.html', icon: 'fas fa-arrow-down', text: 'أذونات التوريد' },
                    { href: 'dispense.html', icon: 'fas fa-arrow-up', text: 'أذونات الصرف والعهد' }
                ]
            },
            {
                section: 'البيانات المالية والإدارية',
                items: [
                    { href: 'entities.html', icon: 'fas fa-building', text: 'الموردون والجهات' },
                    { href: 'report.html', icon: 'fas fa-file-alt', text: 'التقارير' }
                ]
            },
            {
                section: 'النسخ الاحتياطي',
                items: [
                    {
                        action: 'handleBackup',
                        icon: 'fa-solid fa-box-archive',
                        text: 'نسخة احتياطية',
                        isButton: true
                    },
                    {
                        action: 'handleRestore',
                        icon: 'fa-solid fa-file-import',
                        text: 'استيراد نسخة سابقة',
                        isButton: true
                    }
                ]
            },
            {
                section: 'النظام',
                items: [
                    { href: 'settings.html', icon: 'fas fa-cog', text: 'الإعدادات' }
                ]
            }
        ];
    }

    /**
     * Extract current page filename from URL
     * @returns {string} e.g. "dashboard.html"
     */
    getCurrentPage() {
        const path = window.location.pathname;
        return path.substring(path.lastIndexOf('/') + 1) || 'dashboard.html';
    }

    /**
     * Check if a menu item is the active page
     * @param {string} href - The menu item href
     * @returns {boolean}
     */
    isActive(href) {
        return this.currentPage === href;
    }

    /**
     * Render a single menu item
     * @param {Object} item - Menu item config
     * @returns {string} HTML string
     */
    renderMenuItem(item) {
        const isActive = this.isActive(item.href);
        const activeClass = isActive ? 'active' : '';

        if (item.isButton) {
            return `
                <button type="button" class="menu-item ${activeClass}" onclick="${item.action}(event)">
                    <span class="menu-icon"><i class="${item.icon}"></i></span>
                    <span class="menu-text">${item.text}</span>
                </button>
            `;
        }

        return `
            <a href="${item.href}" class="menu-item ${activeClass}">
                <span class="menu-icon"><i class="${item.icon}"></i></span>
                <span class="menu-text">${item.text}</span>
            </a>
        `;
    }

    /**
     * Render a navigation section
     * @param {Object} section - Section config
     * @returns {string} HTML string
     */
    renderSection(section) {
        const itemsHtml = section.items.map(item => this.renderMenuItem(item)).join('');

        return `
            <div class="nav-section">
                <div class="nav-section-title">${section.section}</div>
                ${itemsHtml}
            </div>
        `;
    }

    /**
     * Render the full sidebar HTML
     * @returns {string} Complete sidebar HTML
     */
    render() {
        const sectionsHtml = this.menuItems.map(section => this.renderSection(section)).join('');

        return `
            <aside class="sidebar" id="appSidebar">
                <div class="sidebar-header">
                    <div class="sidebar-brand">
                        <div class="sidebar-brand-icon" id="sidebarLogo">
                            <i class="fas fa-warehouse"></i>
                        </div>
                        <div class="sidebar-brand-text">
                            <div class="sidebar-brand-title">إدارة المخازن</div>
                            <div class="sidebar-brand-subtitle">كلية التقنية الصناعية</div>
                        </div>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    ${sectionsHtml}
                </nav>
            </aside>
        `;
    }

    /**
     * Mount the sidebar into a container element
     * @param {string|HTMLElement} target - Container selector or element
     */
    mount(target = '#layout-root') {
        const container = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!container) {
            console.error('Sidebar mount target not found:', target);
            return;
        }

        container.insertAdjacentHTML('afterbegin', this.render());
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sidebar;
}
