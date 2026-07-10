/**
 * PrintSignatures Component
 * Renders a professional, reusable signature block for printed pages.
 *
 * Usage:
 *   // Render into a container element
 *   PrintSignatures.render('#signaturesContainer', ['المستلم', 'أمين المخزن', 'المدير']);
 *
 *   // Or get the HTML string
 *   const html = PrintSignatures.html(['المستلم', 'أمين المخزن', 'المدير']);
 */
class PrintSignatures {
    /**
     * Generate the signature block HTML for a list of roles.
     * @param {string[]} roles - Role labels to display above each signature line.
     * @returns {string} HTML string.
     */
    static html(roles = ['المستلم', 'أمين المخزن', 'المدير']) {
        const boxes = roles.map(role => `
            <div class="print-signature-box">
                <span class="sig-role">${this.escapeHtml(role)}</span>
                <span class="sig-name">الاسم</span>
                <span class="sig-signature">التوقيع</span>
            </div>
        `).join('');

        return `<div class="print-signatures print-only">${boxes}</div>
        `.trim();
    }

    /**
     * Render the signature block into a container.
     * @param {string|HTMLElement} target - Selector string or DOM element.
     * @param {string[]} roles - Role labels.
     */
    static render(target, roles = ['المستلم', 'أمين المخزن', 'المدير']) {
        const container = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!container) {
            console.warn('[PrintSignatures] Container not found:', target);
            return;
        }

        container.innerHTML = this.html(roles);
    }

    /**
     * Escape HTML special characters to avoid XSS in printed labels.
     * @param {string} text
     * @returns {string}
     */
    static escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrintSignatures;
}
