<?php

class Item {
    private $conn;
    private $table_name = "items";

    public $item_id;
    public $item_name;
    public $unit;
    public $category;
    public $min_order_qty;

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * جلب كافة الأصناف الفعالة مع تجاهل السجلات المحذوفة منطقياً
     * 
     * @return PDOStatement
     */
    public function read() {
        $query = "SELECT item_id, item_name, unit, category, min_order_qty FROM " . $this->table_name . " WHERE is_deleted = FALSE ORDER BY item_id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();

        return $stmt;
    }

    /**
     * إضافة صنف جديد إلى قاعدة البيانات
     * 
     * @return boolean
     */
    public function create() {
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

        if($stmt->execute()) {
            return true;
        }

        return false;
    }

    /**
     * تحديث بيانات صنف موجود
     * 
     * @return boolean
     */
    public function update() {
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

        if($stmt->execute()) {
            return true;
        }

        return false;
    }

    /**
     * الحذف المنطقي للصنف (إخفاءه دون حذفه نهائياً من قاعدة البيانات)
     * 
     * @return boolean
     */
    public function delete() {
        $query = "UPDATE " . $this->table_name . " SET is_deleted = TRUE WHERE item_id = :item_id";

        $stmt = $this->conn->prepare($query);

        $this->item_id = htmlspecialchars(strip_tags($this->item_id));
        $stmt->bindParam(':item_id', $this->item_id);

        if($stmt->execute()) {
            return true;
        }

        return false;
    }

}
?>