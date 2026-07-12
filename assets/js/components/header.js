/**
 * Header Component - Renders the application top header
 * Auto-detects current page and supports optional refresh action
 */
class Header {
    constructor(options = {}) {
        this.currentPage = this.getCurrentPage();
        this.options = {
            showRefresh: false,
            refreshAction: '',
            ...options
        };
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
     * Render the full header HTML
     * @returns {string} Complete header HTML
     */
    render() {
        const refreshButton = this.options.showRefresh && this.options.refreshAction
            ? `<button class="header-btn" onclick="${this.options.refreshAction}" title="تحديث" aria-label="تحديث"><i class="fas fa-sync-alt"></i></button>`
            : '';

        return `
            <header class="top-header" id="appTopHeader">
                <button class="header-btn sidebar-toggle" id="sidebarToggleBtn" onclick="toggleSidebar()" title="القائمة" aria-label="فتح القائمة الجانبية" aria-expanded="false" aria-controls="appSidebar"><i class="fas fa-bars"></i></button>
                <div class="header-actions">
                    ${refreshButton}
                    <button class="header-btn" onclick="handleLogout()" title="خروج" aria-label="خروج"><i class="fas fa-door-open"></i></button>
                </div>
            </header>
        `;
    }

    /**
     * Mount the header into a container element at the top
     * @param {string|HTMLElement} target - Container selector or element
     */
    mount(target = 'body') {
        const container = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!container) {
            console.error('Header mount target not found:', target);
            return;
        }

        container.insertAdjacentHTML('afterbegin', this.render());
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Header;
}
