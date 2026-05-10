<?php

class Entity {
    private PDO $conn;
    private string $table_name = "entities";

    // تحديد نوع البيانات (Type Hinting) لمنع الأخطاء العشوائية
    public ?int $entity_id = null;
    public ?string $entity_name = null;
    public ?string $entity_type = null;
    public ?string $phone = null;

    public function __construct(PDO $db) {
        $this->conn = $db;
    }

    // جلب جميع الجهات مع إمكانية الفلترة بنوع محدد
    public function read(?string $type = null): PDOStatement {
        $query = "SELECT entity_id, entity_name, entity_type, phone FROM " . $this->table_name . " WHERE is_deleted = FALSE";
        
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

    // حفظ جهة جديدة في قاعدة البيانات
    public function create(): bool {
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

    // استخراج القيم المسموحة لحقل entity_type مباشرة من هيكلية الجدول
    public function getEntityTypes(): array {
        $query = "SHOW COLUMNS FROM " . $this->table_name . " LIKE 'entity_type'";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        $row = $stmt->fetch();

        // الناتج يكون سلسلة نصية مثل: enum('Supplier','Department','Employee')
        // سنقوم بقصها وتحويلها إلى مصفوفة نظيفة
        $type_string = $row['Type'];
        preg_match('/^enum\((.*)\)$/', $type_string, $matches);
        
        $enum_values = array();
        foreach(explode(',', $matches[1]) as $value){
            // إزالة علامات الاقتباس المفردة من حول الكلمات
            $enum_values[] = trim($value, "'");
        }
        
        return $enum_values;
    }

    // تحديث بيانات الجهة
    public function update(): bool {
        $query = "UPDATE " . $this->table_name . " SET entity_name = :entity_name, entity_type = :entity_type, phone = :phone WHERE entity_id = :entity_id";

        $stmt = $this->conn->prepare($query);

        $this->entity_name = htmlspecialchars(strip_tags($this->entity_name));
        $this->entity_type = htmlspecialchars(strip_tags($this->entity_type));
        $this->phone = htmlspecialchars(strip_tags($this->phone));
        $this->entity_id = htmlspecialchars(strip_tags($this->entity_id));

        $stmt->bindParam(':entity_name', $this->entity_name);
        $stmt->bindParam(':entity_type', $this->entity_type);
        $stmt->bindParam(':phone', $this->phone);
        $stmt->bindParam(':entity_id', $this->entity_id);

        return $stmt->execute();
    }

    // الحذف المنطقي للجهة
    public function delete(): bool {
        $query = "UPDATE " . $this->table_name . " SET is_deleted = TRUE WHERE entity_id = :entity_id";
        $stmt = $this->conn->prepare($query);
        $this->entity_id = htmlspecialchars(strip_tags($this->entity_id));
        $stmt->bindParam(':entity_id', $this->entity_id);
        return $stmt->execute();
    }
}
?>