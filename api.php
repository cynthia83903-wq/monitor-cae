<?php
/**
 * MONITOR CAE – intermediario entre la página (monitorcae.com) y el Apps Script.
 *
 * - La página ya no llama directo al Apps Script: llama a /api.php.
 * - Este archivo agrega una contraseña interna (token) y reenvía la llamada.
 * - Cuenta las claves incorrectas por IP y bloquea temporalmente a quien
 *   falle muchas veces, sin afectar a los demás usuarios.
 *
 * La dirección del Apps Script y el token NO están aquí (el repositorio es
 * público): viven en  ../mcae-privado/config.php , fuera de public_html.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// ---- límites ----
const MAX_FALLOS   = 5;    // claves incorrectas permitidas por IP...
const VENTANA_SEG  = 900;  // ...en 15 minutos
const BLOQUEO_SEG  = 900;  // bloqueo de 15 minutos para esa IP
const MAX_PET_MIN  = 120;  // solicitudes por minuto por IP (uso normal: muy por debajo)
const MAX_CUERPO   = 15 * 1024 * 1024; // 15 MB (fotos de evidencia)

function responder(array $r, int $codigo = 200): void {
  http_response_code($codigo);
  echo json_encode($r, JSON_UNESCAPED_UNICODE);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  responder(['ok' => false, 'error' => 'Método no permitido'], 405);
}

// ---- configuración privada ----
$privado = dirname(__DIR__) . '/mcae-privado';
$cfgArchivo = $privado . '/config.php';
if (!is_file($cfgArchivo)) responder(['ok' => false, 'error' => 'Servicio no configurado'], 500);
$cfg = require $cfgArchivo;
if (empty($cfg['exec']) || empty($cfg['token'])) responder(['ok' => false, 'error' => 'Servicio no configurado'], 500);

// ---- estado por IP ----
$dirLim = $privado . '/limites';
if (!is_dir($dirLim)) @mkdir($dirLim, 0700, true);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$archivoIp = $dirLim . '/' . hash('sha256', $ip) . '.json';
$ahora = time();
$st = ['fallos' => [], 'bloqueo' => 0, 'pet' => []];
if (is_file($archivoIp)) {
  $j = json_decode((string) @file_get_contents($archivoIp), true);
  if (is_array($j)) $st = array_merge($st, $j);
}
$guardar = function () use (&$st, $archivoIp): void {
  @file_put_contents($archivoIp, json_encode($st), LOCK_EX);
};

if ((int) $st['bloqueo'] > $ahora) {
  $min = (int) ceil(((int) $st['bloqueo'] - $ahora) / 60);
  responder(['ok' => false, 'error' => "Demasiados intentos fallidos desde esta conexión. Espera $min minuto(s) e inténtalo de nuevo."], 429);
}

$st['pet'] = array_values(array_filter($st['pet'], fn($t) => $t > $ahora - 60));
$st['pet'][] = $ahora;
if (count($st['pet']) > MAX_PET_MIN) {
  $guardar();
  responder(['ok' => false, 'error' => 'Demasiadas solicitudes. Espera un minuto.'], 429);
}

// ---- solicitud de la página ----
$cuerpo = (string) file_get_contents('php://input', false, null, 0, MAX_CUERPO + 1);
if (strlen($cuerpo) > MAX_CUERPO) { $guardar(); responder(['ok' => false, 'error' => 'Archivo demasiado grande'], 413); }
$req = json_decode($cuerpo, true);
if (!is_array($req) || empty($req['fn']) || !is_string($req['fn'])) {
  $guardar();
  responder(['ok' => false, 'error' => 'Solicitud no válida'], 400);
}
$req['token'] = $cfg['token'];

// ---- reenvío al Apps Script ----
$ch = curl_init($cfg['exec']);
curl_setopt_array($ch, [
  CURLOPT_POST           => true,
  CURLOPT_POSTFIELDS     => json_encode($req, JSON_UNESCAPED_UNICODE),
  CURLOPT_HTTPHEADER     => ['Content-Type: text/plain;charset=utf-8'],
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,   // Apps Script responde con una redirección
  CURLOPT_MAXREDIRS      => 5,
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_TIMEOUT        => 120,
]);
$resp = curl_exec($ch);
$http = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($resp === false || $http >= 500) {
  $guardar();
  responder(['ok' => false, 'error' => 'Sin conexión con el servidor de datos. Inténtalo de nuevo.'], 502);
}

$out = json_decode((string) $resp, true);
if (!is_array($out)) {
  $guardar();
  responder(['ok' => false, 'error' => 'Respuesta no válida del servidor de datos'], 502);
}

// ---- contar claves incorrectas de esta IP ----
if (empty($out['ok']) && isset($out['error']) && strpos((string) $out['error'], 'Clave de acceso') !== false) {
  $st['fallos'] = array_values(array_filter($st['fallos'], fn($t) => $t > $ahora - VENTANA_SEG));
  $st['fallos'][] = $ahora;
  if (count($st['fallos']) >= MAX_FALLOS) {
    $st['bloqueo'] = $ahora + BLOQUEO_SEG;
    $st['fallos'] = [];
  }
} elseif (!empty($out['ok'])) {
  $st['fallos'] = [];
}
$guardar();

echo json_encode($out, JSON_UNESCAPED_UNICODE);
