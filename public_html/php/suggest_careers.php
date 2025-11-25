<?php
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

include_once 'database.php';

$grupyPrzedmiotow = [
    'nauki_scisle' => ['matematyka', 'fizyka', 'chemia', 'informatika'],
    'nauki_przyrodnicze' => ['biologia', 'chemia', 'fizyka'],
    'nauki_humanistyczne' => ['j. polski', 'historia', 'WOS', 'geografia'],
    'jezyki_obce' => ['j. angielski'],
    'sztuka' => ['plastyka', 'muzyka'],
    'techniczne' => ['technika', 'informatyka']
];

function mapLevelToValue($level) {
    switch($level) {
        case 'wysoki': return [3, 4];
        case 'średni': return [2, 3];
        case 'niski': return [1, 2];
        default: return [1];
    }
}

function findCareersForAllSubjects($db, $przedmioty, $zabronionePrzedmioty = []) {
    $allCareers = [];
    
    $stmt = $db->prepare("SELECT DISTINCT alias, id FROM m_grades WHERE id IS NOT NULL");
    $stmt->execute();
    $allAliases = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($allAliases as $careerInfo) {
        $id = $careerInfo['id']; 
        $alias = $careerInfo['alias'];

        $stmt = $db->prepare("SELECT tytul, poziom_value FROM m_grades WHERE alias = ?");
        $stmt->execute([$alias]);
        $careerSubjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $careerSubjectMap = [];
        foreach ($careerSubjects as $subject) {
            $careerSubjectMap[$subject['tytul']] = $subject['poziom_value'];
        }
        
        $matchesAll = true;
        $matchingSubjectsCount = 0;
        $totalScore = 0;
        $matchedSubjects = [];
        
        foreach ($przedmioty as $requiredSubject => $requiredLevel) {
            $allowedLevels = mapLevelToValue($requiredLevel);
            
            if (isset($careerSubjectMap[$requiredSubject])) {
                $careerLevel = $careerSubjectMap[$requiredSubject];
                
                if (in_array($careerLevel, $allowedLevels)) {
                    $matchingSubjectsCount++;
                    $totalScore += $careerLevel;
                    $matchedSubjects[] = [
                        'przedmiot' => $requiredSubject,
                        'poziom' => $careerLevel,
                        'required_level' => $requiredLevel
                    ];
                } else {
                    $matchesAll = false;
                    break;
                }
            } else {
                $matchesAll = false;
                break;
            }
        }
        
        if ($matchesAll && $matchingSubjectsCount === count($przedmioty)) {
            $hasForbidden = false;
            if (!empty($zabronionePrzedmioty)) {
                foreach ($zabronionePrzedmioty as $forbiddenSubject) {
                    if (isset($careerSubjectMap[$forbiddenSubject]) && $careerSubjectMap[$forbiddenSubject] > 2) {
                        $hasForbidden = true;
                        break;
                    }
                }
            }
            
            if (!$hasForbidden) {
                $allCareers[$alias] = [
                    'alias' => $alias,
                    'id_zawodu' => $id, 
                    'matching_subjects' => $matchingSubjectsCount,
                    'subjects' => $matchedSubjects,
                    'total_score' => $totalScore,
                    'all_career_subjects' => $careerSubjects,
                    'uwzgledniono_zabronione' => true
                ];
            }
        }
    }
    
    return $allCareers;
}

function findCareersWithoutForbiddenFilter($db, $przedmioty) {
    $allCareers = [];
    
    $stmt = $db->prepare("SELECT DISTINCT alias, id FROM m_grades WHERE id IS NOT NULL");
    $stmt->execute();
    $allCareerInfo = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($allCareerInfo as $careerInfo) {
        $alias = $careerInfo['alias'];
        $id = $careerInfo['id']; 
        
        $stmt = $db->prepare("SELECT tytul, poziom_value FROM m_grades WHERE alias = ?");
        $stmt->execute([$alias]);
        $careerSubjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $careerSubjectMap = [];
        foreach ($careerSubjects as $subject) {
            $careerSubjectMap[$subject['tytul']] = $subject['poziom_value'];
        }
        
        $matchesAll = true;
        $matchingSubjectsCount = 0;
        $totalScore = 0;
        $matchedSubjects = [];
        
        foreach ($przedmioty as $requiredSubject => $requiredLevel) {
            $allowedLevels = mapLevelToValue($requiredLevel);
            
            if (isset($careerSubjectMap[$requiredSubject])) {
                $careerLevel = $careerSubjectMap[$requiredSubject];
                
                if (in_array($careerLevel, $allowedLevels)) {
                    $matchingSubjectsCount++;
                    $totalScore += $careerLevel;
                    $matchedSubjects[] = [
                        'przedmiot' => $requiredSubject,
                        'poziom' => $careerLevel,
                        'required_level' => $requiredLevel
                    ];
                } else {
                    $matchesAll = false;
                    break;
                }
            } else {
                $matchesAll = false;
                break;
            }
        }
        
        if ($matchesAll && $matchingSubjectsCount === count($przedmioty)) {
            $allCareers[$alias] = [
                'alias' => $alias,
                'id_zawodu' => $id, 
                'matching_subjects' => $matchingSubjectsCount,
                'subjects' => $matchedSubjects,
                'total_score' => $totalScore,
                'all_career_subjects' => $careerSubjects,
                'uwzgledniono_zabronione' => false
            ];
        }
    }
    
    return $allCareers;
}

function znajdzZawody($db, $przedmioty, $zabronionePrzedmioty) {
    $wszystkieZawody = [];
    $czyUwzglednionoZabronione = !empty($zabronionePrzedmioty);

    $careersWithForbidden = findCareersForAllSubjects($db, $przedmioty, $zabronionePrzedmioty);
    
    if (!empty($careersWithForbidden)) {
        foreach ($careersWithForbidden as $career) {
            $wszystkieZawody[] = [
                'nazwa_zawodu' => $career['alias'],
                'id_zawodu' => $career['id_zawodu'], 
                'liczba_pasujacych_przedmiotow' => $career['matching_subjects'],
                'wymagane_przedmioty' => implode(', ', array_map(function($subj) {
                    if ($subj['poziom'] == 1) {
                        $levelText = 'podstawowy';
                    } elseif ($subj['poziom'] == 2) {
                        $levelText = 'średni';
                    } elseif ($subj['poziom'] == 3) {
                        $levelText = 'wysoki';
                    } else {
                        $levelText = 'ekspercki';
                    }
                    return $subj['przedmiot'] . ' (' . $levelText . ')';
                }, $career['subjects'])),
                'szczegoly_przedmiotow' => $career['all_career_subjects'],
                'grupa' => 'dopasowanie',
                'uwzgledniono_zabronione' => true,
                'total_score' => $career['total_score']
            ];
        }
    }

    if (empty($wszystkieZawody) && !empty($zabronionePrzedmioty)) {
        $czyUwzglednionoZabronione = false;
        
        $careersWithoutForbidden = findCareersWithoutForbiddenFilter($db, $przedmioty);
        
        foreach ($careersWithoutForbidden as $career) {
            $wszystkieZawody[] = [
                'nazwa_zawodu' => $career['alias'],
                'id_zawodu' => $career['id_zawodu'],
                'liczba_pasujacych_przedmiotow' => $career['matching_subjects'],
                'wymagane_przedmioty' => implode(', ', array_map(function($subj) {
                    if ($subj['poziom'] == 1) {
                        $levelText = 'podstawowy';
                    } elseif ($subj['poziom'] == 2) {
                        $levelText = 'średni';
                    } elseif ($subj['poziom'] == 3) {
                        $levelText = 'wysoki';
                    } else {
                        $levelText = 'ekspercki';
                    }
                    return $subj['przedmiot'] . ' (' . $levelText . ')';
                }, $career['subjects'])),
                'szczegoly_przedmiotow' => $career['all_career_subjects'],
                'grupa' => 'dopasowanie',
                'uwzgledniono_zabronione' => false,
                'total_score' => $career['total_score']
            ];
        }
    }

    return [
        'zawody' => $wszystkieZawody,
        'czy_uwzgledniono_zabronione' => $czyUwzglednionoZabronione
    ];
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        throw new Exception('Brak danych wejściowych');
    }

    if (!isset($input['przedmioty']) || !is_array($input['przedmioty'])) {
        throw new Exception('Brak danych o przedmiotach');
    }

    $przedmioty = $input['przedmioty'];
    $zabronionePrzedmioty = isset($input['zabronione_przedmioty']) ? $input['zabronione_przedmioty'] : [];

    error_log("Otrzymane przedmioty: " . print_r($przedmioty, true));
    error_log("Zabronione przedmioty: " . print_r($zabronionePrzedmioty, true));

    $database = new Database();
    $db = $database->connect();

    $wynik = znajdzZawody($db, $przedmioty, $zabronionePrzedmioty);
    $wszystkieZawody = $wynik['zawody'];
    $czyUwzglednionoZabronione = $wynik['czy_uwzgledniono_zabronione'];

    usort($wszystkieZawody, function($a, $b) {
        return $b['total_score'] - $a['total_score'];
    });

    $wszystkieZawody = array_slice($wszystkieZawody, 0, 817);

    $komunikatZabronione = '';
    if (!empty($zabronionePrzedmioty)) {
        if ($czyUwzglednionoZabronione) {
            $komunikatZabronione = 'Znalezione zawody wymagają niechcianych przedmiotów tylko na poziomie podstawowym.';
        } else {
            $komunikatZabronione = 'Uwaga: Nie udało się znaleźć zawodów spełniających wszystkie preferencje. Pokazano zawody bez uwzględnienia niechcianych przedmiotów.';
        }
    }

    echo json_encode([
        'success' => true,
        'liczba_znalezionych_zawodow' => count($wszystkieZawody),
        'zawody' => $wszystkieZawody,
        'przedmioty_wejsciowe' => $przedmioty,
        'zabronione_przedmioty' => $zabronionePrzedmioty,
        'czy_uwzgledniono_zabronione' => $czyUwzglednionoZabronione,
        'komunikat_zabronione' => $komunikatZabronione,
        'debug_info' => [
            'przedmioty_wejsciowe_count' => count($przedmioty),
            'zabronione_count' => count($zabronionePrzedmioty),
            'wymagane_wszystkie_przedmioty' => true
        ]
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?>