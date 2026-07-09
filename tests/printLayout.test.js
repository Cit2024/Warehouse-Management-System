/**
 * Smoke test for PrintLayout component
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentPath = path.join(__dirname, '..', 'assets', 'js', 'components', 'printLayout.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');

let elements = {};
let bodyHtml = '';

global.document = {
    body: {
        insertAdjacentHTML: (position, html) => {
            bodyHtml += html;
            const idMatches = html.matchAll(/\sid="([^"]+)"/g);
            for (const match of idMatches) {
                if (!elements[match[1]]) elements[match[1]] = createMockElement(match[1]);
            }
        }
    },
    getElementById: (id) => elements[id] || null,
    addEventListener: () => {},
    removeEventListener: () => {}
};

function createMockElement(id) {
    return {
        id,
        textContent: '',
        innerHTML: ''
    };
}

vm.runInThisContext(componentSource, { filename: componentPath });

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

console.log('\nPrintLayout Component Test');
console.log('==========================\n');

assert(typeof PrintLayout === 'function', 'PrintLayout class is defined');

const layout = new PrintLayout({
    layout: 'report',
    title: 'تقرير حالة المخزون',
    showDates: true,
    summaryItems: [
        { id: 'printReportName', label: 'اسم التقرير', defaultValue: '-' },
        { id: 'printRecordCount', label: 'عدد السجلات', defaultValue: '0' }
    ]
});

assert(elements['printLayoutRoot'] !== undefined, 'Print layout root is rendered');
assert(elements['printTitle'] !== undefined, 'Print title element exists');
assert(elements['printReportName'] !== undefined, 'Summary item printReportName exists');
assert(elements['printRecordCount'] !== undefined, 'Summary item printRecordCount exists');

layout.setTitle('تقرير الجرد');
assert(elements['printTitle'].textContent === 'تقرير الجرد', 'setTitle updates the title');

layout.setSummary({ printReportName: 'تقرير الجرد', printRecordCount: '25' });
assert(elements['printReportName'].textContent === 'تقرير الجرد', 'setSummary updates printReportName');
assert(elements['printRecordCount'].textContent === '25', 'setSummary updates printRecordCount');

layout.setDates(new Date('2026-07-09'));
assert(elements['printGregorianDate'].textContent.length > 0, 'setDates sets gregorian date');

delete elements.printLayoutRoot;

const receiptLayout = new PrintLayout({
    layout: 'receipt',
    title: 'إذن صرف',
    subtitle: 'Dispense Receipt',
    summaryItems: [
        { id: 'printReceiptDateValue', label: 'تاريخ الصرف', defaultValue: '-' },
        { id: 'printItemCount', label: 'عدد الأصناف', defaultValue: '0' }
    ]
});
assert(elements['printReceiptTitle'] !== undefined, 'Receipt title element exists');
receiptLayout.setDates(new Date('2026-07-09'));
assert(elements['printReceiptDate'].textContent.includes('تاريخ الطباعة'), 'Receipt setDates sets printReceiptDate');

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
