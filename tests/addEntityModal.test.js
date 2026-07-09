/**
 * Smoke test for AddEntityModal component
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentPath = path.join(__dirname, '..', 'assets', 'js', 'components', 'addEntityModal.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');

let elements = {};
let bodyHtml = '';

global.document = {
    body: {
        insertAdjacentHTML: (position, html) => {
            bodyHtml += html;
            const matches = html.matchAll(/\sid="([^"]+)"/g);
            for (const match of matches) {
                elements[match[1]] = createMockElement(match[1]);
            }
        }
    },
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => {
        if (selector === '.error-message') return [];
        if (selector === '[data-action]') {
            return [
                createMockElement('btnClose'),
                createMockElement('btnSubmit')
            ].map(btn => {
                btn.dataset = { action: btn.id === 'btnClose' ? 'close' : 'submit' };
                return btn;
            });
        }
        return [];
    },
    addEventListener: () => {},
    removeEventListener: () => {}
};

global.window = { api: { addEntity: async () => ({ success: true }) } };
global.showToast = (msg) => { console.log('toast:', msg); };
global.checkSession = () => ({ role: 'admin' });

function createMockElement(id) {
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        hidden: true,
        classList: { classes: [], add: function(c) { this.classes.push(c); }, remove: function(c) { this.classes = this.classes.filter(x => x !== c); } },
        dataset: {},
        addEventListener: () => {},
        focus: () => {},
        reset: () => {},
        querySelectorAll: (selector) => {
            if (selector === '[data-action]') {
                return [
                    createMockElement('btnClose'),
                    createMockElement('btnSubmit')
                ].map(btn => {
                    btn.dataset = { action: btn.id === 'btnClose' ? 'close' : 'submit' };
                    return btn;
                });
            }
            return [];
        }
    };
}

vm.runInThisContext(componentSource, { filename: componentPath });

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

console.log('\nAddEntityModal Component Test');
console.log('=============================\n');

assert(typeof AddEntityModal === 'function', 'AddEntityModal class is defined');

let successCalled = false;
const modal = new AddEntityModal({ onSuccess: () => { successCalled = true; } });

assert(elements['addModal'] !== undefined, 'Modal element is rendered');
assert(elements['addEntityForm'] !== undefined, 'Form element is rendered');
assert(elements['entityName'] !== undefined, 'Name input exists');

modal.open();
assert(elements['addModal'].hidden === false, 'open() unhides the modal');
assert(elements['addModal'].classList.classes.includes('active'), 'open() adds active class');

modal.close();
assert(elements['addModal'].hidden === true, 'close() hides the modal');

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
