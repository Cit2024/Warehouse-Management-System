<?php

// إعدادات الترويسة لقبول الطلبات من نوع POST وتحديد نوع البيانات
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once '../../config/database.php';
include_once '../../models/Item.php';

$database = new Database();
$db = $database->getConnection();

$item = new Item($db);

/* 
 * استقبال البيانات المرسلة في جسم الطلب (Body)
 * نستخدم php://input لأن البيانات ستأتي بصيغة JSON وليس كـ Form Data عادي
 */
$data = json_decode(file_get_contents("php://input"));

// التحقق من أن البيانات الأساسية غير فارغة قبل محاولة الحفظ
if(
    !empty($data->item_name) &&
    !empty($data->unit)
) {
    // تعيين قيم الخصائص
    $item->item_name = $data->item_name;
    $item->unit = $data->unit;
    $item->category = isset($data->category) ? $data->category : null;
    $item->min_order_qty = isset($data->min_order_qty) ? $data->min_order_qty : 0;

    // محاولة إنشاء السجل في قاعدة البيانات
    if($item->create()) {
        http_response_code(201);
        echo json_encode(array("message" => "تم إضافة الصنف بنجاح."), JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(array("message" => "تعذر إضافة الصنف، حدث خطأ في الخادم."), JSON_UNESCAPED_UNICODE);
    }
} else {
    // إرجاع خطأ إذا كانت البيانات غير مكتملة
    http_response_code(400);
    echo json_encode(array("message" => "بيانات غير مكتملة، يرجى إدخال اسم الصنف والوحدة على الأقل."), JSON_UNESCAPED_UNICODE);
}

?>