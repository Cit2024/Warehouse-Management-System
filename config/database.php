<?php
//TODO:create .env file
class Database {
    // إعدادات قاعدة البيانات
    private $host = "localhost";
    private $db_name = "WarehouseSystem";
    private $username = "root";  
    private $password = "";     
    public $conn;

    public function getConnection() {
        $this->conn = null;

        try {
            // استخدام PDO لضمان الأمان ودعم UTF-8
            $this->conn = new PDO("mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4", $this->username, $this->password);
            
            // تفعيل وضع إظهار الأخطاء ليسهل علينا اكتشاف المشاكل
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            // إرجاع البيانات دائماً على شكل مصفوفة ترابطية (Associative Array)
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            
        } catch(PDOException $exception) {
            echo "خطأ في الاتصال بقاعدة البيانات: " . $exception->getMessage();
        }

        return $this->conn;
    }
}
?>
