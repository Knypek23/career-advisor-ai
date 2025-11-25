<?php

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

include_once 'database.php';

try {
    $database = new Database();
    $db = $database->connect();

    // Pobierz unikalne cechy charakteru z bazy
    $query = "SELECT DISTINCT cecha_charakteru FROM character_traits ORDER BY cecha_charakteru";
    $stmt = $db->prepare($query);
    $stmt->execute();
    
    $cechy = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    echo json_encode([
        'success' => true,
        'cechy_charakteru' => $cechy,
        'liczba_cech' => count($cechy)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>