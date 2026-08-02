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
    createElement: (tag) => createMockElement('dynamic-' + tag),
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

global.window = { api: {
    addEntity: async () => ({ success: true }),
    getAllEntities: async () => ([
        { entity_id: 1, entity_name: 'الإدارة العامة', entity_type: 'Department', depth: 0 },
        { entity_id: 2, entity_name: 'قسم المشتريات', entity_type: 'Department', depth: 1 },
        { entity_id: 3, entity_name: 'شركة الأفق', entity_type: 'Supplier', depth: 0 }
    ])
} };
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
        children: [],
        appendChild: function(child) { this.children.push(child); },
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

// --- Parent (hierarchy) select ---------------------------------------------
assert(elements['entityParent'] !== undefined, 'Parent select is rendered');
assert(elements['entityParentGroup'] !== undefined, 'Parent form-group is rendered');

// updateParentVisibility toggles via the hidden property (mock has no style)
elements['entityType'].value = 'Supplier';
modal.updateParentVisibility();
assert(elements['entityParentGroup'].hidden === true, 'Supplier hides the parent group');

elements['entityType'].value = 'Department';
modal.updateParentVisibility();
assert(elements['entityParentGroup'].hidden === false, 'Department shows the parent group');

// loadParentOptions fills Departments only, with depth indentation.
// (open() fires its own unawaited load and the mock's innerHTML reset can't
// clear the children array — assert on option contents, not counts.)
(async () => {
    await modal.loadParentOptions();
    const labels = elements['entityParent'].children.map(o => o.textContent);
    assert(labels.length > 0, 'parent options are populated');
    assert(!labels.some(l => l.includes('شركة الأفق')), 'a Supplier never becomes a parent option');
    assert(labels.includes('الإدارة العامة'), 'root department present with no indent prefix');
    assert(labels.includes('— قسم المشتريات'), 'child department present, indented by depth');

    console.log('\n---------------------------');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('---------------------------\n');

    process.exit(failed > 0 ? 1 : 0);
})();
