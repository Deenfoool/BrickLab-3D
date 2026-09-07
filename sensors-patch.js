import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

const TWO_PI = Math.PI * 2
const HISTORY_LIMIT = 180
const LOG_LIMIT = 12000

function bodyRotation(body) {
  const rotation = body.rotation()
  return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
}

function actualRpm(monitor) {
  const angular = monitor.body.angvel()
  const axis = monitor.localAxis.clone().applyQuaternion(bodyRotation(monitor.body)).normalize()
  return new THREE.Vector3(angular.x, angular.y, angular.z).dot(axis) * 60 / TWO_PI
}

function buildSensorMonitors(session) {
  const monitors = []
  if (!session.drivetrain) return monitors
  for (const object of session.objects) {
    const definition = findPart(object.userData.partId)
    const sensor = definition?.mechanics?.sensor
    if (!sensor) continue
    const shaftRef = session.drivetrain.shaftByPart.get(object.userData.instanceId)
    const shaft = session.drivetrain.shafts.find(item => item.id === shaftRef?.id)
    const member = session.members.get(object.userData.instanceId)
    if (!shaft || !member) continue
    const localAxis = shaft.axisWorld.clone().applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()
    monitors.push({ id: object.userData.instanceId, name: definition.name, kind: sensor.kind, shaft, body: member.body, localAxis, actualRpm: 0, actualTorque: 0 })
  }
  return monitors
}

function estimateShaftTorque(session, shaft) {
  if (shaft.torqueCapacity == null) return 0
  const drive = session.motorDrives.find(item => item.id === shaft.sourceMotorId)
  if (!drive) return shaft.torqueCapacity
  const ratio = Math.max(Math.abs(shaft.ratioFromMotor ?? 1), 0.001)
  const efficiency = shaft.efficiency ?? 1
  return Math.min(shaft.torqueCapacity, (drive.torque ?? 0) / ratio * efficiency)
}

function appendHistory(history, value) {
  history.push(value)
  if (history.length > HISTORY_LIMIT) history.shift()
}

function drawTrend(canvas, history) {
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = canvas.clientWidth || 260
  const height = canvas.clientHeight || 92
  const targetWidth = Math.round(width * dpr)
  const targetHeight = Math.round(height * dpr)
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = '#252c31'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i += 1) {
    const y = height * i / 4
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }
  const drawSeries = (values, color, maxValue) => {
    if (values.length < 2) return
    const max = Math.max(maxValue, ...values.map(value => Math.abs(value)), 0.001)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    values.forEach((value, index) => {
      const x = index / Math.max(1, HISTORY_LIMIT - 1) * width
      const normalized = Math.max(-1, Math.min(1, value / max))
      const y = height * 0.5 - normalized * height * 0.42
      if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  drawSeries(history.rpm, '#74e6a6', 120)
  drawSeries(history.speed, '#69a9ff', 0.5)
  ctx.font = '8px ui-monospace, monospace'
  ctx.fillStyle = '#74e6a6'; ctx.fillText('RPM', 6, 11)
  ctx.fillStyle = '#69a9ff'; ctx.fillText('m/s', 34, 11)
}

function csvValue(value) {
  if (value == null) return ''
  const text = String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function telemetryFilename(session) {
  const scenario = session.scenario && session.scenario !== 'flat' ? session.scenario : 'simulate'
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  return `bricklab-${scenario}-physics-v2-${stamp}.csv`
}

function exportTelemetryCsv(session) {
  const samples = session.telemetryLog ?? []
  if (!samples.length) return
  const sensorHeaders = (session.sensorMonitors ?? []).map((sensor, index) => ({
    id: sensor.id,
    header: `${sensor.kind}_${index + 1}_${sensor.kind === 'rpm' ? 'rpm' : 'torque_nm'}`,
  }))
  const wheelCount = Math.max(0, ...samples.map(sample => sample.wheels?.length ?? 0))
  const wheelHeaders = Array.from({ length: wheelCount }, (_, index) => [
    `wheel_${index + 1}_contact`, `wheel_${index + 1}_load_n`, `wheel_${index + 1}_slip_ratio`, `wheel_${index + 1}_slip_angle_deg`, `wheel_${index + 1}_long_force_n`, `wheel_${index + 1}_lat_force_n`,
  ]).flat()
  const headers = [
    'physics_time_s','test_elapsed_s','scenario','test_phase','test_status','quality','surface','mass_kg',
    'body_speed_mps','body_accel_mps2','primary_rpm','motor_load_pct','motor_torque_nm','motor_power_w','motor_input_power_w','motor_efficiency_pct','pull_force_n','dyno_power_w',
    ...sensorHeaders.map(item => item.header), ...wheelHeaders,
  ]
  const rows = [headers]
  for (const sample of samples) {
    const row = [
      sample.time.toFixed(4), sample.testElapsed.toFixed(4), sample.scenario, sample.testPhase, sample.testStatus, sample.quality, sample.surface, sample.massKg.toFixed(5),
      sample.bodySpeed.toFixed(5), sample.bodyAcceleration.toFixed(5), sample.primaryRpm.toFixed(3), sample.motorLoad.toFixed(2), sample.motorTorque.toFixed(5), sample.motorPower.toFixed(5), sample.motorInputPower.toFixed(5), sample.motorEfficiency.toFixed(2), sample.pullForce == null ? '' : sample.pullForce.toFixed(5), sample.dynoPower == null ? '' : sample.dynoPower.toFixed(5),
      ...sensorHeaders.map(item => Number.isFinite(sample.sensors[item.id]) ? sample.sensors[item.id].toFixed(5) : ''),
    ]
    for (let index = 0; index < wheelCount; index += 1) {
      const wheel = sample.wheels?.[index]
      row.push(wheel ? Number(wheel.contact) : '', wheel ? wheel.normalLoadN.toFixed(5) : '', wheel ? wheel.slipRatio.toFixed(5) : '', wheel ? wheel.slipAngleDeg.toFixed(4) : '', wheel ? wheel.longitudinalForceN.toFixed(5) : '', wheel ? wheel.lateralForceN.toFixed(5) : '')
    }
    rows.push(row)
  }
  const csv = rows.map(row => row.map(csvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = telemetryFilename(session); document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}

function recordTelemetrySample(session, primaryRpm, bodySpeed) {
  session.telemetryLog ??= []
  const drive = session.motorDrives[0]
  const sensorValues = {}
  for (const sensor of session.sensorMonitors ?? []) sensorValues[sensor.id] = sensor.kind === 'rpm' ? sensor.actualRpm : sensor.actualTorque
  session.telemetryLog.push({
    time: session.simulationTime ?? 0,
    testElapsed: session.testElapsed ?? 0,
    scenario: session.scenario ?? 'flat',
    testPhase: session.scenarioData?.phase ?? 'RUN',
    testStatus: session.testStatus ?? 'RUNNING',
    quality: session.quality?.id ?? 'balanced',
    surface: session.scenarioData?.surface ?? 'concrete',
    massKg: session.chassisMonitor?.totalMassKg ?? 0,
    bodySpeed,
    bodyAcceleration: session.chassisMonitor?.acceleration ?? 0,
    primaryRpm,
    motorLoad: (drive?.load ?? 0) * 100,
    motorTorque: drive?.torque ?? 0,
    motorPower: drive?.powerW ?? 0,
    motorInputPower: drive?.inputPowerW ?? 0,
    motorEfficiency: (drive?.efficiency ?? 0) * 100,
    pullForce: session.scenario === 'torque-pull' ? Number(session.scenarioData?.currentForceN ?? 0) : null,
    dynoPower: session.scenario === 'dyno-bench' ? Number(session.scenarioData?.dynoPowerW ?? 0) : null,
    sensors: sensorValues,
    wheels: (session.wheelMonitors ?? []).map(wheel => ({
      contact: wheel.contact,
      normalLoadN: wheel.normalLoadN ?? 0,
      slipRatio: wheel.slipRatio ?? 0,
      slipAngleDeg: wheel.slipAngleDeg ?? 0,
      longitudinalForceN: wheel.longitudinalForceN ?? 0,
      lateralForceN: wheel.lateralForceN ?? 0,
    })),
  })
  if (session.telemetryLog.length > LOG_LIMIT) session.telemetryLog.shift()
}

const previousMountTelemetry = PhysicsSession.prototype.mountTelemetry
PhysicsSession.prototype.mountTelemetry = function mountSensorTelemetry(...args) {
  const result = previousMountTelemetry.apply(this, args)
  this.sensorMonitors = buildSensorMonitors(this)
  this.sensorHistory ??= { rpm: [], speed: [] }
  this.telemetryLog ??= []
  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel) return result
  if (this.sensorMonitors.length && !panel.querySelector('[data-sensor-section]')) {
    const section = document.createElement('div')
    section.className = 'telemetry-section sensor-telemetry'
    section.dataset.sensorSection = 'true'
    section.innerHTML = `<label>PLACEABLE SENSORS · VALUE · SHAFT</label>${this.sensorMonitors.slice(0, 8).map((sensor, index) => `<div class="sensor-row" data-sensor-id="${sensor.id}"><span>${sensor.kind === 'rpm' ? 'RPM' : 'TORQUE'} ${index + 1}</span><b data-sensor-value>0</b><small>${sensor.shaft.id}</small></div>`).join('')}`
    const wheelSection = [...panel.querySelectorAll('.telemetry-section')].find(item => item.querySelector('label')?.textContent?.startsWith('WHEELS'))
    if (wheelSection) panel.insertBefore(section, wheelSection); else panel.append(section)
  }
  if (!panel.querySelector('[data-trend-section]')) {
    const trend = document.createElement('div')
    trend.className = 'telemetry-section trend-telemetry'; trend.dataset.trendSection = 'true'
    trend.innerHTML = `<div class="trend-head"><label>LIVE HISTORY · RPM / BODY SPEED</label><button type="button" data-export-telemetry title="Export Physics v2 telemetry CSV"><i data-lucide="file-down"></i><span>CSV</span></button></div><canvas data-live-trend></canvas><div class="trend-values"><span>RPM <b data-trend-rpm>0</b></span><span>SPEED <b data-trend-speed>0.000 m/s</b></span></div>`
    panel.append(trend); trend.querySelector('[data-export-telemetry]').onclick = () => exportTelemetryCsv(this); window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
  }
  return result
}

const previousUpdateTelemetry = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateSensorTelemetry(force = false, ...args) {
  const result = previousUpdateTelemetry.call(this, force, ...args)
  if (!force && this.telemetryTick % 6 !== 0) return result
  this.sensorMonitors ??= buildSensorMonitors(this); this.sensorHistory ??= { rpm: [], speed: [] }
  for (const sensor of this.sensorMonitors) {
    sensor.actualRpm = actualRpm(sensor); sensor.actualTorque = estimateShaftTorque(this, sensor.shaft)
    const value = document.querySelector(`[data-sensor-id="${sensor.id}"]`)?.querySelector('[data-sensor-value]')
    if (value) value.textContent = sensor.kind === 'rpm' ? `${Math.round(sensor.actualRpm)} RPM` : `${sensor.actualTorque.toFixed(4)} N·m`
  }
  const primaryRpm = this.motorDrives[0]?.actualRpm ?? (this.shaftMonitors[0] ? actualRpm(this.shaftMonitors[0]) : 0), bodySpeed = this.chassisMonitor?.speed ?? 0
  appendHistory(this.sensorHistory.rpm, Number.isFinite(primaryRpm) ? primaryRpm : 0); appendHistory(this.sensorHistory.speed, Number.isFinite(bodySpeed) ? bodySpeed : 0)
  recordTelemetrySample(this, Number.isFinite(primaryRpm) ? primaryRpm : 0, Number.isFinite(bodySpeed) ? bodySpeed : 0)
  const rpmValue = document.querySelector('[data-trend-rpm]'), speedValue = document.querySelector('[data-trend-speed]')
  if (rpmValue) rpmValue.textContent = `${Math.round(this.sensorHistory.rpm.at(-1) ?? 0)}`
  if (speedValue) speedValue.textContent = `${(this.sensorHistory.speed.at(-1) ?? 0).toFixed(3)} m/s`
  drawTrend(document.querySelector('[data-live-trend]'), this.sensorHistory)
  return result
}

const previousDispose = PhysicsSession.prototype.dispose
PhysicsSession.prototype.dispose = function disposeSensorTelemetry(...args) {
  const result = previousDispose.apply(this, args); this.sensorMonitors = []; this.sensorHistory = { rpm: [], speed: [] }; this.telemetryLog = []; return result
}
