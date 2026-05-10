<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../../config/database.php';
include_once '../../models/Transaction.php';

$database = new Database();
$db = $database->getConnection();
$transaction = new Transaction($db);

// التحقق مما إذا كان الطلب لإذن محدد أو للقائمة كاملة
$transaction_id = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($transaction_id) {
    // 1. مسار عرض إذن مفصل (رأس + تفاصيل)
    $stmt = $transaction->readOne($transaction_id);
    
    if ($stmt->rowCount() > 0) {
        $row = $stmt->fetch();
        
        // تجهيز مصفوفة الرأس
        $transaction_arr = array(
            "transaction_id" => $row['transaction_id'],
            "transaction_type" => $row['transaction_type'],
            "transaction_date" => $row['transaction_date'],
            "receipt_number" => $row['receipt_number'],
            "store_name" => $row['store_name'],
            "entity_name" => $row['entity_name'],
            "created_by_name" => $row['created_by_name'],
            "notes" => $row['notes'],
            "items" => array() // سنملأها بالأصناف الآن
        );

        // جلب التفاصيل من الجدول المرتبط
        $details_stmt = $transaction->getTransactionDetails($transaction_id);
        while ($detail_row = $details_stmt->fetch()) {
            $item = array(
                "detail_id" => $detail_row['detail_id'],
                "item_id" => $detail_row['item_id'],
                "item_name" => $detail_row['item_name'],
                "unit" => $detail_row['unit'],
                "quantity" => $detail_row['quantity'],
                "unit_price" => $detail_row['unit_price']
            );
            array_push($transaction_arr["items"], $item);
        }

        http_response_code(200);
        echo json_encode($transaction_arr, JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(404);
        echo json_encode(["message" => "لم يتم العثور على الإذن المطلوب."], JSON_UNESCAPED_UNICODE);
    }

} else {
    // 2. مسار عرض قائمة الإذونات
    $stmt = $transaction->readAll();
    
    if ($stmt->rowCount() > 0) {
        $transactions_arr = array();
        $transactions_arr["records"] = array();

        while ($row = $stmt->fetch()) {
            $transaction_item = array(
                "transaction_id" => $row['transaction_id'],
                "transaction_type" => $row['transaction_type'],
                "transaction_date" => $row['transaction_date'],
                "receipt_number" => $row['receipt_number'],
                "store_name" => $row['store_name'],
                "entity_name" => $row['entity_name'],
                "created_by_name" => $row['created_by_name']
            );
            array_push($transactions_arr["records"], $transaction_item);
        }

        http_response_code(200);
        echo json_encode($transactions_arr, JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(404);
        echo json_encode(["message" => "لا توجد حركات مخزنية مسجلة."], JSON_UNESCAPED_UNICODE);
    }
}
?>