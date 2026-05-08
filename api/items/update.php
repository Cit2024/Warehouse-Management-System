<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: PUT");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once '../../config/database.php';
include_once '../../models/Item.php';

$database = new Database();
$db = $database->getConnection();

$item = new Item($db);

$data = json_decode(file_get_contents("php://input"));

// التحقق من وجود المعرف الأساسي (item_id) لإتمام التعديل
if(!empty($data->item_id) && !empty($data->item_name) && !empty($data->unit)) {
    
    $item->item_id = $data->item_id;
    $item->item_name = $data->item_name;
    $item->unit = $data->unit;
    $item->category = isset($data->category) ? $data->category : null;
    $item->min_order_qty = isset($data->min_order_qty) ? $data->min_order_qty : 0;

    if($item->update()) {
        http_response_code(200);
        echo json_encode(array("message" => "تم تعديل بيانات الصنف بنجاح."), JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(array("message" => "تعذر تعديل الصنف."), JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(array("message" => "بيانات غير مكتملة، يرجى إرسال رقم الصنف والبيانات الأساسية."), JSON_UNESCAPED_UNICODE);
}
?>