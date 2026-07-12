// ============================================================
// حراسة الأرصدة
//
// دوال خالصة (Pure): تستقبل اتصال قاعدة البيانات، ولا تعتمد على Electron،
// لذلك يمكن اختبارها مباشرة على قاعدة بيانات في الذاكرة.
//
// تُستدعى من داخل db.transaction() في main.js: أي رمي خطأ هنا يتراجع عن
// المعاملة بالكامل، ويلتقطه الـ handler ويحوّله إلى رسالة عربية للمستخدم.
// ============================================================

/**
 * دمج سطور الإذن حسب الصنف.
 *
 * الواجهة تمنع تكرار الصنف في نفس الإذن، لكن الخادم لا يجوز أن يثق بذلك:
 * سطران بكمية 6 لصنف رصيده 10 يمرّان من أي فحص يتم سطراً بسطر.
 */
function aggregateByItem(items) {
    const totals = new Map();
    for (const item of items) {
        const itemId = Number(item.itemId);
        const quantity = Number(item.quantity);

        if (!Number.isInteger(itemId) || itemId <= 0) {
            throw new Error('الإذن يحتوي على صنف غير صالح.');
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('الكمية يجب أن تكون رقماً أكبر من صفر.');
        }

        totals.set(itemId, (totals.get(itemId) || 0) + quantity);
    }
    return totals;
}

/**
 * التحقق من صحة سطور الإذن قبل الحفظ (كميات وأسعار وأصناف موجودة).
 * @returns {Map<number, number>} الكميات مجمّعة حسب الصنف
 */
function validateReceiptItems(db, items, { requirePrice = false } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('لا يمكن حفظ إذن بدون أصناف.');
    }

    if (requirePrice) {
        for (const item of items) {
            const price = Number(item.price);
            if (!Number.isFinite(price) || price < 0) {
                throw new Error('السعر يجب أن يكون رقماً غير سالب.');
            }
        }
    }

    const totals = aggregateByItem(items);

    // نتأكد أن كل صنف موجود وغير محذوف منطقياً
    const lookup = db.prepare('SELECT item_name FROM items WHERE item_id = ? AND is_deleted = 0');
    for (const itemId of totals.keys()) {
        if (!lookup.get(itemId)) {
            throw new Error(`الصنف المطلوب (رقم ${itemId}) غير موجود أو محذوف.`);
        }
    }

    return totals;
}

/**
 * يرمي خطأً إذا كان رصيد أي صنف من الأصناف المُمرّرة سالباً.
 *
 * يُستدعى بعد الكتابة وداخل نفس المعاملة: SQLite يُظهر للاتصال تعديلاته غير
 * المُثبّتة، فيعكس view_current_stock أثر السطور التي كُتبت للتو، والرمي هنا
 * يتراجع عن كل شيء.
 *
 * هذا هو نفس الفحص المستخدم عند إلغاء إذن توريد (سحب بضاعة صُرفت بالفعل)،
 * لذلك القاعدة واحدة: لا يجوز لأي عملية أن تترك رصيداً سالباً.
 */
function assertNoNegativeStock(db, itemIds) {
    const ids = [...itemIds];
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(', ');
    const shortages = db.prepare(`
        SELECT i.item_name, i.unit, vcs.current_quantity
        FROM view_current_stock vcs
        JOIN items i ON i.item_id = vcs.item_id
        WHERE vcs.item_id IN (${placeholders})
          AND vcs.current_quantity < 0
    `).all(...ids);

    if (shortages.length === 0) return;

    const details = shortages.map((s) => {
        // الرصيد الآن سالب؛ المتاح قبل هذه العملية = الرصيد + العجز
        const shortfall = Math.abs(s.current_quantity);
        return `«${s.item_name}» (العجز: ${shortfall} ${s.unit || ''})`.trim();
    }).join('، ');

    throw new Error(`الكمية المتاحة لا تكفي: ${details}. يرجى مراجعة الأرصدة.`);
}

module.exports = { aggregateByItem, validateReceiptItems, assertNoNegativeStock };
