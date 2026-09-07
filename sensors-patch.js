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

    const localAxis = shaft.axisWorld.clone()
      .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
      .normalize()

    monitors.push({
      id: object.userData.instanceId,
      name: definition.name,
      kind: sensor.kind,
      shaft,
      body: member.body,
      localAxis,
      actualRpm: 0,
      actualTorque: 0,
    })
  }
  return monitors
}

function estimateShaftTorque(session, shaft) {
  if (shaft.torqueCapacity == null) return 0
  const drive = session.motorDrives.find(item => item.id === shaft.sourceMotorId)
  if (!drive) return shaft.torqueCapacity
  const ratio = Math.max(Math.abs(shaft.ratioFromMotor ?? 1), 0.001)
  const efficiency = shaft.efficiency ?? 1
  return Math.min(shaft.torqueCapacity, drive.torque / ratio * efficiency)
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
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
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
      if (!index) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

  drawSeries(history.rpm, '#74e6a6', 120)
  drawSeries(history.speed, '#69a9ff', 4)

  ctx.font = '8px ui-monospace, monospace'
  ctx.fillStyle = '#74e6a6'
  ctx.fillText('RPM', 6, 11)
  ctx.fillStyle = '#69a9ff'
  ctx.fillText('SPEED', 34, 11)
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
  return `bricklab-${scenario}-${stamp}.csv`
}

function exportTelemetryCsv(session) {
  const samples = session.telemetryLog ?? []
  if (!samples.length) return

  const sensorHeaders = (session.sensorMonitors ?? []).map((sensor, index) => ({
    id: sensor.id,
    header: `${sensor.kind}_${index + 1}_${sensor.kind === 'rpm' ? 'rpm' : 'torque_T'}`,
  }))

  const headers = [
    'time_s',
    'scenario',
    'test_status',
    'body_speed_u_s',
    'body_accel_u_s2',
    'primary_rpm',
    'motor_load_pct',
    'motor_torque_T',
    'pull_force_F',
    ...sensorHeaders.map(item => item.header),
  ]

  const rows = [headers]
  for (const sample of samples) {
    rows.push([
      sample.time.toFixed(3),
      sample.scenario,
      sample.testStatus,
      sample.bodySpeed.toFixed(4),
      sample.bodyAcceleration.toFixed(4),
      sample.primaryRpm.toFixed(3),
      sample.motorLoad.toFixed(2),
      sample.motorTorque.toFixed(4),
      sample.pullForce == null ? '' : sample.pullForce.toFixed(4),
      ...sensorHeaders.map(item => {
        const value = sample.sensors[item.id]
        return Number.isFinite(value) ? value.toFixed(4) : ''
      }),
    ])
  }

  const csv = rows.map(row => row.map(csvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = telemetryFilename(session)
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function recordTelemetrySample(session, primaryRpm, bodySpeed) {
  session.telemetryLog ??= []
  const drive = session.motorDrives[0]
  const sensorValues = {}
  for (const sensor of session.sensorMonitors ?? []) {
    sensorValues[sensor.id] = sensor.kind === 'rpm' ? sensor.actualRpm : sensor.actualTorque
  }

  session.telemetryLog.push({
    time: session.simulationTime ?? 0,
    scenario: session.scenario ?? 'flat',
    testStatus: session.testStatus ?? 'RUNNING',
    bodySpeed,
    bodyAcceleration: session.chassisMonitor?.acceleration ?? 0,
    primaryRpm,
    motorLoad: (drive?.load ?? 0) * 100,
    motorTorque: drive?.torque ?? 0,
    pullForce: session.scenario === 'torque-pull' ? Number(session.scenarioData?.currentForce ?? 0) : null,
    sensors: sensorValues,
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
    section.innerHTML = `
      <label>PLACEABLE SENSORS · VALUE · SHAFT</label>
      ${this.sensorMonitors.slice(0, 8).map((sensor, index) => `
        <div class="sensor-row" data-sensor-id="${sensor.id}">
          <span>${sensor.kind === 'rpm' ? 'RPM' : 'TORQUE'} ${index + 1}</span>
          <b data-sensor-value>0</b>
          <small>${sensor.shaft.id}</small>
        </div>
      `).join('')}
    `
    const wheelSection = [...panel.querySelectorAll('.telemetry-section')]
      .find(item => item.querySelector('label')?.textContent?.startsWith('WHEELS'))
    if (wheelSection) panel.insertBefore(section, wheelSection)
    else panel.append(section)
  }

  if (!panel.querySelector('[data-trend-section]')) {
    const trend = document.createElement('div')
    trend.className = 'telemetry-section trend-telemetry'
    trend.dataset.trendSection = 'true'
    trend.innerHTML = `
      <div class="trend-head"><label>LIVE HISTORY · RPM / BODY SPEED</label><button type="button" data-export-telemetry title="Export telemetry CSV"><i data-lucide="file-down"></i><span>CSV</span></button></div>
      <canvas data-live-trend></canvas>
      <div class="trend-values"><span>RPM <b data-trend-rpm>0</b></span><span>SPEED <b data-trend-speed>0.00</b></span></div>
    `
    panel.append(trend)
    trend.querySelector('[data-export-telemetry]').onclick = () => exportTelemetryCsv(this)
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
  }
  return result
}

const previousUpdateTelemetry = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateSensorTelemetry(force = false, ...args) {
  const result = previousUpdateTelemetry.call(this, force, ...args)
  if (!force && this.telemetryTick % 6 !== 0) return result

  this.sensorMonitors ??= buildSensorMonitors(this)
  this.sensorHistory ??= { rpm: [], speed: [] }

  for (const sensor of this.sensorMonitors) {
    sensor.actualRpm = actualRpm(sensor)
    sensor.actualTorque = estimateShaftTorque(this, sensor.shaft)
    const row = document.querySelector(`[data-sensor-id="${sensor.id}"]`)
    const value = row?.querySelector('[data-sensor-value]')
    if (!value) continue
    value.textContent = sensor.kind === 'rpm'
      ? `${Math.round(sensor.actualRpm)} RPM`
      : `${sensor.actualTorque.toFixed(2)} T`
  }

  const primaryRpm = this.motorDrives[0]?.actualRpm ?? (this.shaftMonitors[0] ? actualRpm(this.shaftMonitors[0]) : 0)
  const bodySpeed = this.chassisMonitor?.speed ?? 0
  appendHistory(this.sensorHistory.rpm, Number.isFinite(primaryRpm) ? primaryRpm : 0)
  appendHistory(this.sensorHistory.speed, Number.isFinite(bodySpeed) ? bodySpeed : 0)
  recordTelemetrySample(this, Number.isFinite(primaryRpm) ? primaryRpm : 0, Number.isFinite(bodySpeed) ? bodySpeed : 0)

  const rpmValue = document.querySelector('[data-trend-rpm]')
  const speedValue = document.querySelector('[data-trend-speed]')
  if (rpmValue) rpmValue.textContent = `${Math.round(this.sensorHistory.rpm.at(-1) ?? 0)}`
  if (speedValue) speedValue.textContent = `${(this.sensorHistory.speed.at(-1) ?? 0).toFixed(2)}`
  drawTrend(document.querySelector('[data-live-trend]'), this.sensorHistory)
  return result
}

const previousDispose = PhysicsSession.prototype.dispose
PhysicsSession.prototype.dispose = function disposeSensorTelemetry(...args) {
  const result = previousDispose.apply(this, args)
  this.sensorMonitors = []
  this.sensorHistory = { rpm: [], speed: [] }
  this.telemetryLog = []
  return result
}
