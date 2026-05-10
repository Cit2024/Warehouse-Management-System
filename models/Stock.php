<?php

class Stock {
    private PDO $conn;
    private string $table_name = "view_current_stock";

    public function __construct(PDO $db) {
        $this->conn = $db;
    }

    // جلب أرصدة المخزون، مع إمكانية الفلترة لجلب الأصناف التي وصلت للحد الأدنى (للتنبيهات)
    public function read(bool $alerts_only = false): PDOStatement {
        $query = "SELECT item_id, item_name, unit, min_order_qty, current_quantity FROM " . $this->table_name;
        
        // إضافة شرط لجلب النواقص فقط إذا تم طلب ذلك
        if ($alerts_only) {
            $query .= " WHERE current_quantity <= min_order_qty";
        }
        
        $query .= " ORDER BY item_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        
        return $stmt;
    }
}
?>