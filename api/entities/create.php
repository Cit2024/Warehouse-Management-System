<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once '../../config/database.php';
include_once '../../models/Entity.php';

$database = new Database();
$db = $database->getConnection();

$entity = new Entity($db);
$data = json_decode(file_get_contents("php://input"));

// التحقق من الحقول الإجبارية
if(
    !empty($data->entity_name) &&
    !empty($data->entity_type) && 
    in_array($data->entity_type,['Supplier', 'Department', 'Employee'])
) {
    $entity->entity_name = $data->entity_name;
    $entity->entity_type = $data->entity_type;
    $entity->phone = isset($data->phone) ? $data->phone : null;

    if($entity->create()) {
        http_response_code(201);
        echo json_encode(array("message" => "تم إضافة الجهة بنجاح."), JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(array("message" => "حدث خطأ أثناء إضافة الجهة."), JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(array("message" => "بيانات غير مكتملة أو نوع الجهة غير صالح."), JSON_UNESCAPED_UNICODE);
}
?>