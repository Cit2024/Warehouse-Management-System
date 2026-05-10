<?php

class Transaction {
    private PDO $conn;
    private string $table_name = "transactions";
    private string $details_table = "transaction_details";

    public ?int $transaction_id = null;
    public ?string $transaction_type = null; // 'In', 'Out', 'Opening_Balance'
    public ?string $transaction_date = null;
    public ?string $receipt_number = null;
    public ?int $store_id = null;
    public ?int $entity_id = null;
    public ?int $created_by = null;
    public ?string $notes = null;

    public function __construct(PDO $db) {
        $this->conn = $db;
    }

    /**
     * حفظ الحركة المخزنية مع تفاصيلها باستخدام Transaction لضمان سلامة البيانات (Atomicity)
     * 
     * @param array $items_details مصفوفة تحتوي على الأصناف (item_id, quantity, unit_price)
     * @return bool
     */
    public function create(array $items_details): bool {
        try {
            // إيقاف الحفظ التلقائي وبدء معاملة قاعدة بيانات لضمان حفظ الرأس والتفاصيل معاً
            $this->conn->beginTransaction();

            // 1. إدخال رأس الحركة المخزنية
            $query = "INSERT INTO " . $this->table_name . " 
                SET 
                transaction_type = :transaction_type,
                transaction_date = :transaction_date,
                receipt_number = :receipt_number,
                store_id = :store_id,
                entity_id = :entity_id,
                created_by = :created_by,
                notes = :notes";

            $stmt = $this->conn->prepare($query);

            // تنظيف البيانات
            $this->transaction_type = htmlspecialchars(strip_tags($this->transaction_type));
            $this->transaction_date = htmlspecialchars(strip_tags($this->transaction_date));
            $this->receipt_number = htmlspecialchars(strip_tags($this->receipt_number));
            $this->notes = htmlspecialchars(strip_tags($this->notes));

            $stmt->bindParam(':transaction_type', $this->transaction_type);
            $stmt->bindParam(':transaction_date', $this->transaction_date);
            $stmt->bindParam(':receipt_number', $this->receipt_number);
            $stmt->bindParam(':store_id', $this->store_id, PDO::PARAM_INT);
            $stmt->bindParam(':entity_id', $this->entity_id, PDO::PARAM_INT);
            $stmt->bindParam(':created_by', $this->created_by, PDO::PARAM_INT);
            $stmt->bindParam(':notes', $this->notes);

            $stmt->execute();

            // جلب المعرف الجديد الذي تم إنشاؤه لرأس الحركة
            $this->transaction_id = (int) $this->conn->lastInsertId();

            // 2. إدخال تفاصيل الأصناف المرتبطة بهذه الحركة
            $detail_query = "INSERT INTO " . $this->details_table . " 
                (transaction_id, item_id, quantity, unit_price) 
                VALUES (:transaction_id, :item_id, :quantity, :unit_price)";
            
            $detail_stmt = $this->conn->prepare($detail_query);

            foreach ($items_details as $item) {
                // التأكد من تمرير قيم افتراضية في حال نقص بعض البيانات من الواجهة الأمامية
                $item_id = (int) $item->item_id;
                $quantity = (float) $item->quantity;
                $unit_price = isset($item->unit_price) ? (float) $item->unit_price : 0.00;

                $detail_stmt->bindParam(':transaction_id', $this->transaction_id, PDO::PARAM_INT);
                $detail_stmt->bindParam(':item_id', $item_id, PDO::PARAM_INT);
                $detail_stmt->bindParam(':quantity', $quantity);
                $detail_stmt->bindParam(':unit_price', $unit_price);
                
                $detail_stmt->execute();
            }

            // تأكيد العملية وحفظها فعلياً في قاعدة البيانات
            $this->conn->commit();
            return true;

        } catch (Exception $e) {
            // في حال حدوث أي خطأ، يتم التراجع عن جميع الإدخالات السابقة في الرأس والتفاصيل
            $this->conn->rollBack();
            // يمكن هنا تسجيل الخطأ في ملف logs خاص بالنظام
            return false;
        }
    }

    /**
     * جلب أنواع الحركات المسموحة ديناميكياً من قاعدة البيانات
     */
    public function getTransactionTypes(): array {
        $query = "SHOW COLUMNS FROM " . $this->table_name . " LIKE 'transaction_type'";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $row = $stmt->fetch();

        preg_match('/^enum\((.*)\)$/', $row['Type'], $matches);
        $enum_values = array();
        foreach(explode(',', $matches[1]) as $value){
            $enum_values[] = trim($value, "'");
        }
        return $enum_values;
    }

    /**
     * جلب قائمة بكل الحركات المخزنية (الرأس فقط) لعرضها في الجداول
     */
    public function readAll(): PDOStatement {
        $query = "SELECT 
                    t.transaction_id, t.transaction_type, t.transaction_date, 
                    t.receipt_number, t.notes,
                    s.store_name, 
                    e.entity_name, 
                    u.full_name AS created_by_name
                    FROM " . $this->table_name . " t
                    LEFT JOIN stores s ON t.store_id = s.store_id
                    LEFT JOIN entities e ON t.entity_id = e.entity_id
                    LEFT JOIN users u ON t.created_by = u.user_id
                    WHERE t.is_deleted = FALSE
                    ORDER BY t.transaction_date DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    /**
     * جلب بيانات الرأس لحركة مخزنية محددة بالرقم
     */
    public function readOne(int $transaction_id): PDOStatement {
        $query = "SELECT 
                    t.transaction_id, t.transaction_type, t.transaction_date, 
                    t.receipt_number, t.notes,
                    s.store_name, 
                    e.entity_name, 
                    u.full_name AS created_by_name
                    FROM " . $this->table_name . " t
                    LEFT JOIN stores s ON t.store_id = s.store_id
                    LEFT JOIN entities e ON t.entity_id = e.entity_id
                    LEFT JOIN users u ON t.created_by = u.user_id
                    WHERE t.transaction_id = :transaction_id AND t.is_deleted = FALSE";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':transaction_id', $transaction_id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt;
    }

    /**
     * جلب سطور الأصناف (التفاصيل) المرتبطة بحركة مخزنية محددة
     */
    public function getTransactionDetails(int $transaction_id): PDOStatement {
        $query = "SELECT 
                    td.detail_id, td.quantity, td.unit_price,
                    i.item_id, i.item_name, i.unit
                    FROM " . $this->details_table . " td
                    JOIN items i ON td.item_id = i.item_id WHERE td.transaction_id = :transaction_id";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':transaction_id', $transaction_id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt;
    }
}
?>