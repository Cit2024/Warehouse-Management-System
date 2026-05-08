<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: DELETE");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once '../../config/database.php';
include_once '../../models/Item.php';

$database = new Database();
$db = $database->getConnection();

$item = new Item($db);

$data = json_decode(file_get_contents("php://input"));

if(!empty($data->item_id)) {
    
    $item->item_id = $data->item_id;

    if($item->delete()) {
        http_response_code(200);
        echo json_encode(array("message" => "تم حذف الصنف بنجاح (حذف منطقي)."), JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(array("message" => "تعذر حذف الصنف."), JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(array("message" => "يرجى توفير رقم الصنف (item_id) للحذف."), JSON_UNESCAPED_UNICODE);
}
?>