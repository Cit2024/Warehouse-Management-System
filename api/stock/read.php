<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../../config/database.php';
include_once '../../models/Stock.php';

$database = new Database();
$db = $database->getConnection();
$stock = new Stock($db);

// التحقق مما إذا كان الطلب مخصصاً لجلب تنبيهات النواقص فقط (?alerts=true)
$alerts_only = isset($_GET['alerts']) && $_GET['alerts'] === 'true';

$stmt = $stock->read($alerts_only);

if ($stmt->rowCount() > 0) {
    $stock_arr = array();
    $stock_arr["records"] = array();

    while ($row = $stmt->fetch()) {
        $stock_item = array(
            "item_id" => $row['item_id'],
            "item_name" => $row['item_name'],
            "unit" => $row['unit'],
            "min_order_qty" => $row['min_order_qty'],
            "current_quantity" => $row['current_quantity']
        );
        array_push($stock_arr["records"], $stock_item);
    }

    http_response_code(200);
    echo json_encode($stock_arr, JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(404);
    $message = $alerts_only ? "لا توجد نواقص في المخزن حالياً." : "لا توجد بيانات للمخزون.";
    echo json_encode(["message" => $message], JSON_UNESCAPED_UNICODE);
}
?>