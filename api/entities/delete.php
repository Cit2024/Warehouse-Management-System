<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: DELETE");

include_once '../../config/database.php';
include_once '../../models/Entity.php';

$database = new Database();
$db = $database->getConnection();
$entity = new Entity($db);

$data = json_decode(file_get_contents("php://input"));

if(!empty($data->entity_id)) {
    $entity->entity_id = $data->entity_id;

    if($entity->delete()) {
        http_response_code(200);
        echo json_encode(["message" => "تم حذف الجهة بنجاح."], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(["message" => "تعذر حذف الجهة."], JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(["message" => "يرجى توفير رقم الجهة (entity_id) للحذف."], JSON_UNESCAPED_UNICODE);
}
?>