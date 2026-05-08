<?php
// TODO: add types to feilds that you think needs it
// TODO: search about getting types from databas using dpo
class Entity {
    private $conn;
    private $table_name = "entities";

    public $entity_id;
    public $entity_name;
    public $entity_type;
    public $phone;

    public function __construct($db) {
        $this->conn = $db;
    }

    /**
     * جلب جميع الجهات الفعالة مع إمكانية الفلترة حسب نوع الجهة (مورد، قسم، موظف)
     * 
     * @param string|null $type لتحديد نوع معين أو جلب الكل إذا كان فارغاً
     * @return PDOStatement
     */
    public function read($type = null) {
        $query = "SELECT entity_id, entity_name, entity_type, phone 
                  FROM " . $this->table_name . " 
                  WHERE is_deleted = FALSE";
        
        if($type) {
            $query .= " AND entity_type = :entity_type";
        }
        
        $query .= " ORDER BY entity_id DESC";

        $stmt = $this->conn->prepare($query);

        if($type) {
            $stmt->bindParam(':entity_type', $type);
        }

        $stmt->execute();
        return $stmt;
    }

    /**
     * إضافة جهة جديدة (مورد، قسم، أو موظف)
     * 
     * @return boolean
     */
    public function create() {
        $query = "INSERT INTO " . $this->table_name . " SET entity_name = :entity_name, entity_type = :entity_type, phone = :phone";

        $stmt = $this->conn->prepare($query);

        $this->entity_name = htmlspecialchars(strip_tags($this->entity_name));
        $this->entity_type = htmlspecialchars(strip_tags($this->entity_type));
        $this->phone = htmlspecialchars(strip_tags($this->phone));

        $stmt->bindParam(':entity_name', $this->entity_name);
        $stmt->bindParam(':entity_type', $this->entity_type);
        $stmt->bindParam(':phone', $this->phone);

        if($stmt->execute()) {
            return true;
        }

        return false;
    }
}
?>
