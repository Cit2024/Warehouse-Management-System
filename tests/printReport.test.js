/**
 * Smoke test for PrintReport component
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentPath = path.join(__dirname, '..', 'assets', 'js', 'components', 'printReport.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');

let printCalls = [];
let writtenDocs = [];
let closedWindows = [];
let toastMessages = [];

const mockWindow = {
    document: {
        write: (html) => writtenDocs.push(html),
        close: () => {}
    },
    onload: null,
    closed: false,
    print: () => printCalls.push('print'),
    close: () => closedWindows.push('close')
};

global.window = global;
global.open = (url, target, features) => mockWindow;

global.document = {};
global.showToast = (msg, type) => { toastMessages.push({ msg, type }); };

vm.runInThisContext(componentSource, { filename: componentPath });

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (e) {
        console.log(`  \u2717 ${name}`);
        console.log(`    ${e.message}`);
        failed++;
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\nPrintReport Component Test');
console.log('==========================\n');

test('PrintReport class is defined', () => {
    assert(typeof PrintReport === 'function', 'PrintReport class not found');
});

test('Global printReport instance is created', () => {
    assert(typeof global.printReport !== 'undefined', 'global.printReport not found');
    assert(global.printReport instanceof PrintReport, 'global.printReport is not a PrintReport instance');
});

test('fmt formats numbers with ar-LY locale', () => {
    const result = global.printReport.fmt(1234.5);
    assert(result.includes('1,234.50') || result.includes('1.234,50') || result.includes('1234.50'), `Unexpected format: ${result}`);
});

test('fmtInt formats integers with ar-LY locale', () => {
    const result = global.printReport.fmtInt(1500);
    assert(result === '1,500' || result === '1500' || result.includes('1,500') || result.includes('1.500'), `Unexpected int format: ${result}`);
});

test('buildSignaturesHtml generates three signature boxes by default', () => {
    const html = global.printReport.buildSignaturesHtml();
    const matches = html.match(/print-sig-box/g);
    assert(matches && matches.length === 3, `Expected 3 signature boxes, got ${matches ? matches.length : 0}`);
});

test('buildSignaturesHtml includes name and signature dotted lines', () => {
    const html = global.printReport.buildSignaturesHtml(['المستلم', 'أمين المخزن']);
    assert(html.includes('الاسم :'), 'Name label missing');
    assert(html.includes('التوقيع :'), 'Signature label missing');
    assert(html.includes('print-sig-name'), 'Name line element missing');
    assert(html.includes('print-sig-signature'), 'Signature line element missing');
});

test('printInventoryTable opens a window and writes a document', () => {
    printCalls = [];
    writtenDocs = [];
    const items = [
        { item_id: 'ITM-001', item_name: 'ورق A4', category: 'قرطاسية', unit: 'رزمة', current_quantity: 50, min_order_qty: 20, unit_price: 25 }
    ];
    global.printReport.printInventoryTable(items, { title: 'تقرير تجريبي' });
    assert(writtenDocs.length === 1, 'Document not written to print window');
    const doc = writtenDocs[0];
    assert(doc.includes('تقرير تجريبي'), 'Title not in document');
    assert(doc.includes('ITM-001'), 'Item ID not in document');
    assert(doc.includes('ورق A4'), 'Item name not in document');
    assert(doc.includes('print-signatures'), 'Signatures missing');
});

test('printReceipt builds supply receipt document', () => {
    printCalls = [];
    writtenDocs = [];
    const data = {
        supplier: 'شركة تجريبية',
        store: 'المخزن الرئيسي',
        notes: 'ملاحظات',
        items: [
            { item_id: 'ITM-002', item_name: 'حبر', unit: 'قطعة', quantity: 5, price: 100 }
        ]
    };
    global.printReport.printReceipt(data, { type: 'supply' });
    assert(writtenDocs.length === 1, 'Receipt document not written');
    const doc = writtenDocs[0];
    assert(doc.includes('إذن توريد'), 'Supply title missing');
    assert(doc.includes('شركة تجريبية'), 'Supplier missing');
    assert(doc.includes('500.00') || doc.includes('500,00') || doc.includes('500'), 'Total value missing');
});

test('printReceipt builds dispense receipt document', () => {
    printCalls = [];
    writtenDocs = [];
    const data = {
        requester: 'قسم تجريبي',
        store: 'المخزن الرئيسي',
        items: [
            { item_id: 'ITM-003', item_name: 'كابل', unit: 'قطعة', quantity: 2 }
        ]
    };
    global.printReport.printReceipt(data, { type: 'dispense' });
    assert(writtenDocs.length === 1, 'Dispense document not written');
    const doc = writtenDocs[0];
    assert(doc.includes('إذن صرف مخزني'), 'Dispense title missing');
    assert(doc.includes('قسم تجريبي'), 'Requester missing');
});

test('printReceipt dispense shows recipient name in meta and on signature line', () => {
    printCalls = [];
    writtenDocs = [];
    const data = {
        requester: 'الإدارة العامة ← قسم المشتريات',
        recipient: 'أحمد علي المنصوري',
        store: 'المخزن الرئيسي',
        items: [
            { item_id: 'ITM-003', item_name: 'كابل', unit: 'قطعة', quantity: 2 }
        ]
    };
    global.printReport.printReceipt(data, { type: 'dispense' });
    const doc = writtenDocs[0];
    assert(doc.includes('اسم المستلم'), 'Recipient meta label missing');
    assert(doc.includes('أحمد علي المنصوري'), 'Recipient name missing');
    assert(doc.includes('الإدارة العامة ← قسم المشتريات'), 'Requester hierarchy path missing');
});

test('buildSignaturesHtml accepts {role, name} entries and fills the line', () => {
    const html = global.printReport.buildSignaturesHtml([{ role: 'المستلم', name: 'أحمد علي' }, 'أمين المخزن']);
    assert(html.includes('المستلم'), 'Role label missing');
    assert(html.includes('أحمد علي'), 'Name not rendered on the line');
    assert(html.includes('أمين المخزن'), 'String-role entry broken by mixed array');
    assert(html.includes('الاسم :'), 'Name label missing');
});

test('printDashboardSummary builds summary document', () => {
    printCalls = [];
    writtenDocs = [];
    const stats = { totalItems: 5, totalUnits: 120, totalValue: 5000, lowStock: 1 };
    const items = [
        { item_id: 'ITM-004', item_name: 'قفازات', category: 'سلامة', unit: 'زوج', current_quantity: 30, min_order_qty: 20 }
    ];
    global.printReport.printDashboardSummary(stats, items, { title: 'ملخص تجريبي' });
    assert(writtenDocs.length === 1, 'Summary document not written');
    const doc = writtenDocs[0];
    assert(doc.includes('ملخص تجريبي'), 'Summary title missing');
    assert(doc.includes('إجمالي الأصناف'), 'Stats label missing');
});

test('escapeHtml prevents HTML injection', () => {
    const result = global.printReport.escapeHtml('<script>alert("xss")</script>');
    assert(!result.includes('<script>'), 'HTML not escaped');
    assert(result.includes('&lt;script&gt;'), 'Script tag not escaped');
});

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
