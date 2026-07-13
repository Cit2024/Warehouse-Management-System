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

/**
 * إلغاء إذن (توريد أو صرف).
 *
 * القاعدة: **لا يجوز لأي إلغاء أن يترك رصيد صنف سالباً.**
 *   - إلغاء إذن صرف مسموح دائماً: هو يُعيد البضاعة إلى المخزن.
 *   - إلغاء إذن توريد مرفوض إذا كانت البضاعة قد صُرفت بالفعل، لأن ذلك يسحب من
 *     المخزن بضاعة غير موجودة. البديل — السماح بالرصيد السالب — يُعيد نفس الخلل
 *     الذي أُصلح في مسار الصرف، ويجعل الدفتر يصف مخزناً مستحيلاً واقعياً.
 *     الرسالة تُخبر المستخدم بالتصرّف الصحيح: إلغاء إذن الصرف المقابل أولاً.
 *
 * لا يوجد "تراجع عن الإلغاء": في دفتر الحسابات، الإجابة الصادقة هي إعادة إدخال
 * الإذن.
 *
 * تُستدعى داخل db.transaction() — أي رمي خطأ هنا يتراجع عن الإلغاء بالكامل.
 */
function voidTransaction(db, { transactionId, reason, voidedBy, voidedAt }) {
    const id = Number(transactionId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('رقم الإذن غير صالح.');
    }

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        throw new Error('يجب إدخال سبب الإلغاء.');
    }

    const header = db.prepare(
        'SELECT transaction_id, transaction_type, is_deleted FROM transactions WHERE transaction_id = ?'
    ).get(id);

    if (!header) {
        throw new Error('لم يتم العثور على الإذن المطلوب.');
    }
    if (header.is_deleted === 1) {
        throw new Error('هذا الإذن ملغى بالفعل.');
    }

    const affectedItems = db.prepare(
        'SELECT DISTINCT item_id FROM transaction_details WHERE transaction_id = ?'
    ).all(id).map((row) => row.item_id);

    const result = db.prepare(`
        UPDATE transactions
        SET is_deleted = 1, void_reason = ?, voided_by = ?, voided_at = ?
        WHERE transaction_id = ? AND is_deleted = 0
    `).run(trimmedReason, voidedBy || null, voidedAt || new Date().toISOString(), id);

    if (result.changes !== 1) {
        throw new Error('تعذّر إلغاء الإذن.');
    }

    // الرصيد الآن يستبعد هذا الإذن (view_current_stock يرشّح is_deleted = 0).
    // إن كان الإلغاء قد جعل أي صنف سالباً، نتراجع عن كل شيء.
    try {
        assertNoNegativeStock(db, affectedItems);
    } catch (shortage) {
        // إلغاء إذن التوريد يسحب بضاعة من المخزن؛ إن كانت قد صُرفت فالرصيد يصير
        // سالباً. نُرشد المستخدم إلى التصرّف الصحيح بدل رسالة عجز عامة.
        if (header.transaction_type === 'In' || header.transaction_type === 'Opening_Balance') {
            throw new Error(
                `لا يمكن إلغاء إذن التوريد: تم صرف جزء من هذه الأصناف بالفعل. ${shortage.message} ` +
                'يجب إلغاء أذونات الصرف المقابلة أولاً.'
            );
        }
        throw shortage;
    }

    return { transactionId: id, transactionType: header.transaction_type };
}

module.exports = { aggregateByItem, validateReceiptItems, assertNoNegativeStock, voidTransaction };
