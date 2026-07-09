/**
 * Minimal smoke test for AddItemModal component
 * Mocks just enough DOM to verify render/open/close/submit wiring.
 */

const fs = require('fs');
const path = require('path');

// Load component source
const componentPath = path.join(__dirname, '..', 'assets', 'js', 'components', 'addItemModal.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');

// Minimal DOM mock
let elements = {};
let bodyHtml = '';

global.document = {
    body: {
        insertAdjacentHTML: (position, html) => {
            bodyHtml += html;
            // Parse created elements into our mock registry
            const divMatches = html.matchAll(/<(\w+)[^>]*?\sid="([^"]+)"/g);
            for (const match of divMatches) {
                elements[match[2]] = createMockElement(match[2], match[1]);
            }
        }
    },
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => {
        if (selector === '.error-message') return [];
        // Support [data-action] selectors against the modal
        const modal = elements['addModal'];
        if (modal && selector.startsWith('[data-action]')) {
            return modal.querySelectorAll(selector);
        }
        return [];
    },
    addEventListener: () => {},
    removeEventListener: () => {}
};

global.window = { api: { addItem: async () => ({ success: true }) } };
global.showToast = (msg) => { console.log('toast:', msg); };
global.checkSession = () => ({ role: 'admin' });

function createMockElement(id, tag) {
    const listeners = {};
    const dataset = {};
    const children = [];
    return {
        id,
        tagName: tag,
        innerHTML: '',
        textContent: '',
        hidden: true,
        classList: {
            classes: [],
            add: function(c) { this.classes.push(c); },
            remove: function(c) { this.classes = this.classes.filter(x => x !== c); }
        },
        dataset,
        children,
        querySelectorAll: function(selector) {
            if (selector === '[data-action]') {
                // Return mock close/submit buttons
                return [
                    createMockElement('btnClose', 'button'),
                    createMockElement('btnSubmit', 'button')
                ].map(btn => {
                    btn.dataset.action = btn.id === 'btnClose' ? 'close' : 'submit';
                    btn.addEventListener = (event, handler) => { listeners[event] = handler; };
                    return btn;
                });
            }
            return [];
        },
        addEventListener: (event, handler) => { listeners[event] = handler; },
        focus: () => {},
        reset: () => {}
    };
}

const vm = require('vm');

// ...

// Execute component in the current global context
vm.runInThisContext(componentSource, { filename: componentPath });

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log('  ✓', message);
    } else {
        failed++;
        console.error('  ✗', message);
    }
}

console.log('\nAddItemModal Component Test');
console.log('===========================\n');

// Test 1: Component class exists
assert(typeof AddItemModal === 'function', 'AddItemModal class is defined');

// Test 2: Instantiation renders modal
const modal = new AddItemModal({ onSuccess: () => {} });
assert(elements['addModal'] !== undefined, 'Modal element is rendered into DOM');
assert(elements['addItemForm'] !== undefined, 'Form element is rendered into DOM');

// Test 3: Open modal
modal.open();
assert(elements['addModal'].hidden === false, 'open() unhides the modal');
assert(elements['addModal'].classList.classes.includes('active'), 'open() adds active class');

// Test 4: Close modal
modal.close();
assert(elements['addModal'].hidden === true, 'close() hides the modal');
assert(!elements['addModal'].classList.classes.includes('active'), 'close() removes active class');

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
