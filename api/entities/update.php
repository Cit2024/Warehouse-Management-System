<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: PUT");

include_once '../../config/database.php';
include_once '../../models/Entity.php';

$database = new Database();
$db = $database->getConnection();
$entity = new Entity($db);

$data = json_decode(file_get_contents("php://input"));
$allowed_types = $entity->getEntityTypes();

if(
    !empty($data->entity_id) && 
    !empty($data->entity_name) &&
    !empty($data->entity_type) && 
    in_array($data->entity_type, $allowed_types)
) {
    $entity->entity_id = $data->entity_id;
    $entity->entity_name = $data->entity_name;
    $entity->entity_type = $data->entity_type;
    $entity->phone = isset($data->phone) ? $data->phone : null;

    if($entity->update()) {
        http_response_code(200);
        echo json_encode(["message" => "تم تعديل بيانات الجهة بنجاح."], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(["message" => "تعذر تعديل الجهة."], JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(["message" => "بيانات غير مكتملة أو نوع الجهة غير صالح."], JSON_UNESCAPED_UNICODE);
}
?>