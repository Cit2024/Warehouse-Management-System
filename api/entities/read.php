<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../../config/database.php';
include_once '../../models/Entity.php';

$database = new Database();
$db = $database->getConnection();

$entity = new Entity($db);

// التحقق مما إذا كان هناك طلب لجلب نوع معين فقط (مثال: ?type=Supplier)
$type = isset($_GET['type']) ? $_GET['type'] : null;

$stmt = $entity->read($type);
$num = $stmt->rowCount();

if($num > 0) {
    $entities_arr = array();
    $entities_arr["records"] = array();

    while ($row = $stmt->fetch()) {
        extract($row);

        $entity_item = array(
            "entity_id" => $entity_id,
            "entity_name" => $entity_name,
            "entity_type" => $entity_type,
            "phone" => $phone
        );

        array_push($entities_arr["records"], $entity_item);
    }

    http_response_code(200);
    echo json_encode($entities_arr, JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(404);
    echo json_encode(array("message" => "لا توجد جهات مسجلة."), JSON_UNESCAPED_UNICODE);
}
?>