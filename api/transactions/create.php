<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

include_once '../../config/database.php';
include_once '../../models/Transaction.php';

$database = new Database();
$db = $database->getConnection();
$transaction = new Transaction($db);

$data = json_decode(file_get_contents("php://input"));
$allowed_types = $transaction->getTransactionTypes();

// التحقق من صحة واكتمال البيانات الأساسية (الرأس) ووجود مصفوفة أصناف صالحة
if(
    !empty($data->transaction_type) && in_array($data->transaction_type, $allowed_types) &&
    !empty($data->transaction_date) &&
    !empty($data->store_id) &&
    !empty($data->items) && is_array($data->items) && count($data->items) > 0
) {
    // تعيين خصائص رأس الحركة
    $transaction->transaction_type = $data->transaction_type;
    $transaction->transaction_date = $data->transaction_date;
    $transaction->receipt_number = isset($data->receipt_number) ? $data->receipt_number : null;
    $transaction->store_id = $data->store_id;
    $transaction->entity_id = isset($data->entity_id) ? $data->entity_id : null;
    $transaction->created_by = isset($data->created_by) ? $data->created_by : null;
    $transaction->notes = isset($data->notes) ? $data->notes : null;

    // استدعاء دالة الإنشاء وتمرير مصفوفة الأصناف
    if($transaction->create($data->items)) {
        http_response_code(201);
        echo json_encode(["message" => "تم حفظ إذن " . ($data->transaction_type == 'In' ? 'التوريد' : 'الصرف') . " بنجاح."], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(503);
        echo json_encode(["message" => "حدث خطأ أثناء حفظ الإذن، تم التراجع عن العملية لضمان سلامة المخزون."], JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(400);
    echo json_encode(["message" => "بيانات غير مكتملة. تأكد من إدخال نوع وتاريخ الحركة، المخزن، وصنف واحد على الأقل."], JSON_UNESCAPED_UNICODE);
}
?>