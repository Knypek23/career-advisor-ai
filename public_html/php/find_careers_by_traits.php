<?php
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

include_once 'database.php';

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['cechy_charakteru']) || !is_array($input['cechy_charakteru'])) {
        throw new Exception('Brak danych o cechach charakteru');
    }

    $cechy = $input['cechy_charakteru'];
    $limit = isset($input['limit']) ? intval($input['limit']) : 10;

    $database = new Database();
    $db = $database->connect();

    $placeholders = implode(',', array_fill(0, count($cechy), '?'));
    
    $query = "
        SELECT DISTINCT 
            ct.alias,
            GROUP_CONCAT(DISTINCT ct.cecha_charakteru SEPARATOR ', ') as pasujace_cechy,
            COUNT(DISTINCT ct.cecha_charakteru) as liczba_pasujacych_cech
        FROM character_traits ct
        WHERE ct.cecha_charakteru IN ($placeholders)
        GROUP BY ct.alias
        ORDER BY liczba_pasujacych_cech DESC, ct.alias ASC
        LIMIT ?
    ";

    $stmt = $db->prepare($query);
    
    $paramIndex = 1;
    foreach ($cechy as $cecha) {
        $stmt->bindValue($paramIndex, $cecha, PDO::PARAM_STR);
        $paramIndex++;
    }
    $stmt->bindValue($paramIndex, $limit, PDO::PARAM_INT);
    
    $stmt->execute();
    
    $zawody = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $zawodyZeSzczegolami = [];
    foreach ($zawody as $zawod) {
        $stmt = $db->prepare("
            SELECT DISTINCT alias, 
                   GROUP_CONCAT(CONCAT(tytul, ' (', poziom_value, ')') SEPARATOR ', ') as wymagane_przedmioty
            FROM m_grades 
            WHERE alias = ?
            GROUP BY alias
        ");
        $stmt->execute([$zawod['alias']]);
        $szczegoly = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $zawodyZeSzczegolami[] = array_merge($zawod, [
            'wymagane_przedmioty' => $szczegoly ? $szczegoly['wymagane_przedmioty'] : 'Brak danych'
        ]);
    }

    echo json_encode([
        'success' => true,
        'liczba_znalezionych_zawodow' => count($zawodyZeSzczegolami),
        'zawody' => $zawodyZeSzczegolami,
        'cechy_wejsciowe' => $cechy
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?>