<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../../config/database.php';
include_once '../../models/Item.php';

$database = new Database();
$db = $database->getConnection();

$item = new Item($db);
$stmt = $item->read();
$num = $stmt->rowCount();

if($num > 0) {
    $items_arr = array();
    $items_arr["records"] = array();

    while ($row = $stmt->fetch()) {
        extract($row);

        $item_item = array(
            "item_id" => $item_id,
            "item_name" => $item_name,
            "unit" => $unit,
            "category" => $category,
            "min_order_qty" => $min_order_qty
        );

        array_push($items_arr["records"], $item_item);
    }

    http_response_code(200);
    echo json_encode($items_arr, JSON_UNESCAPED_UNICODE);
} else {
    http_response_code(404);
    echo json_encode(
        array("message" => "لا توجد أصناف مسجلة في النظام."), 
        JSON_UNESCAPED_UNICODE
    );
}
?>