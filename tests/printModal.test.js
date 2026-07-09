/**
 * Smoke test for PrintModal component
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentPath = path.join(__dirname, '..', 'assets', 'js', 'components', 'printModal.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');

let elements = {};
let bodyHtml = '';
let eventListeners = {};

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
        if (selector === '[data-action]') {
            return [
                createMockElement('btnClose'),
                createMockElement('btnPrint')
            ].map(btn => {
                btn.dataset = { action: btn.id === 'btnClose' ? 'close' : 'print' };
                btn.addEventListener = (evt, handler) => { eventListeners[evt] = handler; };
                return btn;
            });
        }
        return [];
    },
    addEventListener: (evt, handler) => { eventListeners[evt] = handler; },
    removeEventListener: () => {}
};

function createMockElement(id) {
    return {
        id,
        textContent: '',
        innerHTML: '',
        hidden: true,
        classList: { classes: [], add: function(c) { this.classes.push(c); }, remove: function(c) { this.classes = this.classes.filter(x => x !== c); } },
        dataset: {},
        addEventListener: () => {},
        focus: () => {},
        querySelectorAll: (selector) => {
            if (selector === '[data-action]') {
                return [
                    createMockElement('btnClose'),
                    createMockElement('btnPrint')
                ].map(btn => {
                    btn.dataset = { action: btn.id === 'btnClose' ? 'close' : 'print' };
                    btn.addEventListener = (evt, handler) => { eventListeners[evt] = handler; };
                    return btn;
                });
            }
            return [];
        }
    };
}

let printCalled = false;

vm.runInThisContext(componentSource, { filename: componentPath });

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

console.log('\nPrintModal Component Test');
console.log('=========================\n');

assert(typeof PrintModal === 'function', 'PrintModal class is defined');

const modal = new PrintModal({
    title: 'تم اعتماد إذن الصرف',
    onPrint: () => { printCalled = true; }
});

assert(elements['printModal'] !== undefined, 'Modal element is rendered');
assert(elements['successMessage'] !== undefined, 'Success message element exists');

modal.open('تم الحفظ بنجاح');
assert(elements['printModal'].hidden === false, 'open() unhides the modal');
assert(elements['printModal'].classList.classes.includes('active'), 'open() adds active class');
assert(elements['successMessage'].textContent === 'تم الحفظ بنجاح', 'open() sets the message');

modal.close();
assert(elements['printModal'].hidden === true, 'close() hides the modal');
assert(!elements['printModal'].classList.classes.includes('active'), 'close() removes active class');

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
