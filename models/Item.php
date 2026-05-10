<?php

class Item {
    private PDO $conn;
    private string $table_name = "items";

    public ?int $item_id = null;
    public ?string $item_name = null;
    public ?string $unit = null;
    public ?string $category = null;
    public ?float $min_order_qty = null;

    public function __construct(PDO $db) {
        $this->conn = $db;
    }

    // جلب كافة الأصناف الفعالة
    public function read(): PDOStatement {
        $query = "SELECT item_id, item_name, unit, category, min_order_qty FROM " . $this->table_name . " WHERE is_deleted = FALSE ORDER BY item_id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // إضافة صنف جديد
    public function create(): bool {
        $query = "INSERT INTO " . $this->table_name . " SET item_name = :item_name, unit = :unit, category = :category, min_order_qty = :min_order_qty";

        $stmt = $this->conn->prepare($query);

        $this->item_name = htmlspecialchars(strip_tags($this->item_name));
        $this->unit = htmlspecialchars(strip_tags($this->unit));
        $this->category = htmlspecialchars(strip_tags($this->category));
        $this->min_order_qty = htmlspecialchars(strip_tags($this->min_order_qty));

        $stmt->bindParam(':item_name', $this->item_name);
        $stmt->bindParam(':unit', $this->unit);
        $stmt->bindParam(':category', $this->category);
        $stmt->bindParam(':min_order_qty', $this->min_order_qty);

        return $stmt->execute();
    }

    // تحديث بيانات الصنف
    public function update(): bool {
        $query = "UPDATE " . $this->table_name . " SET item_name = :item_name, unit = :unit, category = :category, min_order_qty = :min_order_qty WHERE item_id = :item_id";

        $stmt = $this->conn->prepare($query);

        $this->item_name = htmlspecialchars(strip_tags($this->item_name));
        $this->unit = htmlspecialchars(strip_tags($this->unit));
        $this->category = htmlspecialchars(strip_tags($this->category));
        $this->min_order_qty = htmlspecialchars(strip_tags($this->min_order_qty));
        $this->item_id = htmlspecialchars(strip_tags($this->item_id));

        $stmt->bindParam(':item_name', $this->item_name);
        $stmt->bindParam(':unit', $this->unit);
        $stmt->bindParam(':category', $this->category);
        $stmt->bindParam(':min_order_qty', $this->min_order_qty);
        $stmt->bindParam(':item_id', $this->item_id);

        return $stmt->execute();
    }

    // الحذف المنطقي للصنف
    public function delete(): bool {
        $query = "UPDATE " . $this->table_name . " SET is_deleted = TRUE WHERE item_id = :item_id";
        $stmt = $this->conn->prepare($query);
        $this->item_id = htmlspecialchars(strip_tags($this->item_id));
        $stmt->bindParam(':item_id', $this->item_id);
        return $stmt->execute();
    }
}
?>