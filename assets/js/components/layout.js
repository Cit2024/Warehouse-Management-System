/**
 * Layout Component - Next.js-style layout wrapper
 * Initializes sidebar and manages page structure
 */
class Layout {
    constructor(options = {}) {
        this.sidebar = new Sidebar();
        this.options = {
            mountTarget: '#layout-root',
            includeSidebar: true,
            ...options
        };
    }

    /**
     * Initialize the layout
     * - Renders sidebar
     * - Sets up page structure
     */
    init() {
        if (this.options.includeSidebar) {
            const target = this.options.mountTarget;
            let container = typeof target === 'string'
                ? document.querySelector(target)
                : target;

            // Fallback: mount directly into body if no layout root exists
            if (!container) {
                container = document.body;
            }

            this.sidebar.mount(container);
        }

        // Initialize logo
        this.initLogo();
    }

    /**
     * Initialize the sidebar logo from settings or fallback image
     */
    async initLogo() {
        const logoContainer = document.getElementById('sidebarLogo');
        if (!logoContainer) return;

        // Try to load local logo image
        const logoPath = 'assets/images/logo.png';
        const img = new Image();
        img.onload = () => {
            logoContainer.innerHTML = '\u003cimg src="' + logoPath + '" alt="شعار الكلية" style="width:100%;height:100%;object-fit:contain;padding:4px;border-radius:10px;"\u003e';
        };
        img.onerror = () => {
            // Keep default warehouse icon
        };
        img.src = logoPath;

        // Also try settings logo if API available
        try {
            if (window.api && window.api.getSettings) {
                const settings = await window.api.getSettings();
                if (settings && settings.logoPath) {
                    logoContainer.innerHTML = '\u003cimg src="' + settings.logoPath + '" alt="الشعار" style="width:100%;height:100%;object-fit:contain;padding:4px;border-radius:10px;"\u003e';
                }
            }
        } catch (e) {
            console.warn('Failed to load settings logo:', e);
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Layout;
}
