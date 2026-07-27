-- Corregir carrera_id de Emilcy de Telecomunicaciones (5) a Sistemas (1)
UPDATE coordinadores 
SET carrera_id = 1, 
    departamento = 'Ingeniería de Sistemas'
WHERE usuario_id = '48c5b5e4-155b-43cf-b75d-cf715f976141';

-- Verificar el cambio
SELECT 
    c.id,
    c.usuario_id,
    c.carrera_id,
    c.departamento,
    u.nombre,
    u.apellido,
    u.email
FROM coordinadores c
JOIN usuarios u ON c.usuario_id = u.id
WHERE c.usuario_id = '48c5b5e4-155b-43cf-b75d-cf715f976141';














