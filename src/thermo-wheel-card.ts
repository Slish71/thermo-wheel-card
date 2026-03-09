interface HomeAssistantState {
    state: string;
    attributes: Record<string, any>;
}

interface HomeAssistant {
    states: Record<string, HomeAssistantState>;
    callService(domain: string, service: string, data?: Record<string, any>): Promise<void>;
}

interface ThermoWheelCardConfig {
    entity?: string;
    input_entity?: string;
    current_entity?: string;
    top_right_temperature_entity?: string;
    top_right_humidity_entity?: string;
    min?: number;
    max?: number;
    step?: number;
    units?: string;
    commit_delay?: number;
}

declare global {
    interface Window {
        customCards?: Array<{
            type: string;
            name: string;
            description: string;
        }>;
    }
}

class ThermoWheelCard extends HTMLElement {
    private _config!: ThermoWheelCardConfig;
    private _hass!: HomeAssistant;

    private _editing = false;
    private _dragging = false;
    private _dragStartY = 0;
    private _dragStartValue = 0;
    private _pendingValue: number | null = null;
    private _commitTimer: number | null = null;

    private card!: HTMLElement;

    private _svg!: SVGElement;
    private _arcBg!: SVGPathElement;
    private _arcCurrent!: SVGPathElement;
    private _tick!: SVGLineElement;

    private _roomName!: HTMLDivElement;
    private _roomIcon!: HTMLImageElement;
    private _topValue!: HTMLDivElement;
    private _wheel!: HTMLDivElement;
    private _prevEl!: HTMLDivElement;
    private _mainEl!: HTMLDivElement;
    private _mainUnitEl!: HTMLDivElement;
    private _nextEl!: HTMLDivElement;
    private _heatIcon!: HTMLDivElement;

    private _manualIcon!: HTMLDivElement;
    private _autoIcon!: HTMLDivElement;
    private _manualIconImg!: HTMLImageElement;
    private _autoIconImg!: HTMLImageElement;

    private _topRightTempRow!: HTMLDivElement;
    private _topRightHumidityRow!: HTMLDivElement;
    private _topRightTempValue!: HTMLSpanElement;
    private _topRightHumidityValue!: HTMLSpanElement;
    private _topRightTempIcon!: HTMLDivElement;
    private _topRightHumidityIcon!: HTMLDivElement;

    public setConfig(config: ThermoWheelCardConfig): void {
        if (!config.entity && !config.input_entity) {
            throw new Error("Please define either entity or input_entity");
        }

        this._config = {
            min: 10,
            max: 30,
            step: 0.5,
            units: "\u00B0C",
            commit_delay: 5000,
            ...config,
        };

        this._editing = false;
        this._dragging = false;
        this._dragStartY = 0;
        this._dragStartValue = 0;
        this._pendingValue = null;
        this._commitTimer = null;

        if (!this.card) {
            this._buildCard();
        }

        this._render();
    }

    public set hass(hass: HomeAssistant) {
        this._hass = hass;
        this._render();
    }

    public getCardSize(): number {
        return 4;
    }

    private _buildCard(): void {
        this.card = document.createElement("ha-card");
        this.card.style.padding = "8px";
        this.card.style.overflow = "hidden";
        this.card.style.userSelect = "none";
        this.card.style.webkitUserSelect = "none";
        this.card.style.touchAction = "none";
        this.card.style.background = "transparent";
        this.card.style.boxShadow = "none";

        this.card.innerHTML = `
      <div style="position:relative;width:100%;aspect-ratio:1/1;max-width:320px;margin:0 auto;">
        <svg class="twc-svg" viewBox="0 0 300 300" style="width:100%;height:100%;display:block;">
          <line class="twc-demand-tick" x1="0" y1="0" x2="0" y2="0" stroke="#ffffff" stroke-width="2" stroke-linecap="round"></line>
          <path class="twc-arc-bg" fill="none" stroke="#2a2a2a" stroke-width="22" stroke-linecap="round"></path>
          <path class="twc-arc-current" fill="none" stroke="#8f2b22" stroke-width="22" stroke-linecap="round"></path>
        </svg>

        <div class="twc-room-name-wrap"
             style="
               position:absolute;
               top:2px;
               left:18px;
               display:flex;
               align-items:center;
               gap:5px;
               z-index:4;
               max-width:120px;
             ">
          <img class="twc-room-icon"
               src=""
               style="width:12px;height:12px;display:none;flex:0 0 auto;" />
          <div class="twc-room-name"
               style="
                 font-size:12px;
                 line-height:1;
                 color:rgba(255,255,255,0.85);
                 white-space:nowrap;
                 overflow:hidden;
                 text-overflow:ellipsis;
               ">
            Room
          </div>
        </div>

        <div class="twc-top-value"
             style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);font-size:18px;font-weight:500;color:#ffffff;z-index:4;">
          21.0
        </div>

        <div class="twc-top-right"
             style="
               position:absolute;
               top:2px;
               right:18px;
               display:flex;
               flex-direction:column;
               align-items:flex-end;
               gap:3px;
               z-index:4;
               min-width:80px;
             ">
          <div class="twc-tr-humidity-row"
               style="display:flex;align-items:center;gap:5px;color:rgba(255,255,255,0.85);font-size:12px;line-height:1;">
            <span class="twc-tr-humidity-value">--%</span>
            <div class="twc-tr-humidity-icon"
                 style="
                   width:12px;
                   height:12px;
                   background-color:#ffffff;
                   -webkit-mask-image:url('/local/thermo_wheel_card/humidity.png');
                   -webkit-mask-repeat:no-repeat;
                   -webkit-mask-position:center;
                   -webkit-mask-size:contain;
                   mask-image:url('/local/thermo_wheel_card/humidity.png');
                   mask-repeat:no-repeat;
                   mask-position:center;
                   mask-size:contain;
                 ">
            </div>
          </div>

          <div class="twc-tr-temp-row"
               style="display:flex;align-items:center;gap:5px;color:rgba(255,255,255,0.85);font-size:12px;line-height:1;">
            <span class="twc-tr-temp-value">--.-\u00B0C</span>
            <div class="twc-tr-temp-icon"
                 style="
                   width:12px;
                   height:12px;
                   background-color:#ffffff;
                   -webkit-mask-image:url('/local/thermo_wheel_card/outside_temp.png');
                   -webkit-mask-repeat:no-repeat;
                   -webkit-mask-position:center;
                   -webkit-mask-size:contain;
                   mask-image:url('/local/thermo_wheel_card/outside_temp.png');
                   mask-repeat:no-repeat;
                   mask-position:center;
                   mask-size:contain;
                 ">
            </div>
          </div>
        </div>
        <div class="twc-centre-cover"
             style="
               position:absolute;
               left:50%;
               top:50%;
               transform:translate(-50%,-50%);
               width:60%;
               aspect-ratio:1/1;
               border-radius:50%;
               background: var(--ha-card-background, var(--card-background-color, #111111));
               z-index:1;
               pointer-events:none;
             ">
        </div>

        <div class="twc-wheel"
             style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56%;height:42%;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:ns-resize;z-index:2;">
          <div class="twc-value twc-prev"
               style="font-size:22px;line-height:1;color:rgba(255,255,255,0.35);margin-bottom:10px;">
            18.0\u00B0C
          </div>

          <div style="display:flex;align-items:flex-start;justify-content:center;gap:4px;">
            <div class="twc-value twc-main"
                 style="font-size:56px;line-height:0.95;font-weight:700;color:#ffffff;">
              17.5
            </div>
            <div class="twc-value twc-main-unit"
                 style="font-size:22px;line-height:1;margin-top:8px;color:rgba(255,255,255,0.85);">
              \u00B0C
            </div>
          </div>

          <div class="twc-value twc-next"
               style="font-size:22px;line-height:1;color:rgba(255,255,255,0.35);margin-top:10px;">
            17.0\u00B0C
          </div>
        </div>

        <div class="twc-manual-icon"
             style="
               position:absolute;
               left:calc(50% - 40px);
               bottom:44px;
               transform:translateX(-50%);
               width:22px;
               height:22px;
               z-index:3;
               cursor:pointer;
             ">
          <img
            src="/local/thermo_wheel_card/manual_off.png"
            style="width:100%;height:100%;display:block;"
          />
        </div>

        <div class="twc-auto-icon"
             style="
               position:absolute;
               left:calc(50% + 40px);
               bottom:44px;
               transform:translateX(-50%);
               width:22px;
               height:22px;
               z-index:3;
               cursor:pointer;
             ">
          <img
            src="/local/thermo_wheel_card/auto_off.png"
            style="width:100%;height:100%;display:block;"
          />
        </div>

        <div class="twc-heat-icon"
             style="
               position:absolute;
               left:50%;
               bottom:18px;
               transform:translateX(-50%);
               width:22px;
               height:22px;
               display:none;
               z-index:3;
             ">
          <img
            src="/local/thermo_wheel_card/boiler_flame.png"
            style="width:100%;height:100%;display:block;"
          />
        </div>
      </div>
    `;

        this.appendChild(this.card);

        this._svg = this.card.querySelector(".twc-svg") as SVGElement;
        this._arcBg = this.card.querySelector(".twc-arc-bg") as SVGPathElement;
        this._arcCurrent = this.card.querySelector(".twc-arc-current") as SVGPathElement;
        this._tick = this.card.querySelector(".twc-demand-tick") as SVGLineElement;
        this._roomName = this.card.querySelector(".twc-room-name") as HTMLDivElement;
        this._roomIcon = this.card.querySelector(".twc-room-icon") as HTMLImageElement;
        this._topValue = this.card.querySelector(".twc-top-value") as HTMLDivElement;
        this._wheel = this.card.querySelector(".twc-wheel") as HTMLDivElement;
        this._prevEl = this.card.querySelector(".twc-prev") as HTMLDivElement;
        this._mainEl = this.card.querySelector(".twc-main") as HTMLDivElement;
        this._mainUnitEl = this.card.querySelector(".twc-main-unit") as HTMLDivElement;
        this._nextEl = this.card.querySelector(".twc-next") as HTMLDivElement;
        this._heatIcon = this.card.querySelector(".twc-heat-icon") as HTMLDivElement;

        this._manualIcon = this.card.querySelector(".twc-manual-icon") as HTMLDivElement;
        this._autoIcon = this.card.querySelector(".twc-auto-icon") as HTMLDivElement;
        this._manualIconImg = this.card.querySelector(".twc-manual-icon img") as HTMLImageElement;
        this._autoIconImg = this.card.querySelector(".twc-auto-icon img") as HTMLImageElement;

        this._topRightTempRow = this.card.querySelector(".twc-tr-temp-row") as HTMLDivElement;
        this._topRightHumidityRow = this.card.querySelector(".twc-tr-humidity-row") as HTMLDivElement;
        this._topRightTempValue = this.card.querySelector(".twc-tr-temp-value") as HTMLSpanElement;
        this._topRightHumidityValue = this.card.querySelector(".twc-tr-humidity-value") as HTMLSpanElement;
        this._topRightTempIcon = this.card.querySelector(".twc-tr-temp-icon") as HTMLDivElement;
        this._topRightHumidityIcon = this.card.querySelector(".twc-tr-humidity-icon") as HTMLDivElement;

        this._wheel.addEventListener("wheel", (ev) => this._onWheel(ev), { passive: false });
        this._wheel.addEventListener("pointerdown", (ev) => this._onPointerDown(ev));
        this._wheel.addEventListener("pointermove", (ev) => this._onPointerMove(ev));
        this._wheel.addEventListener("pointerup", () => this._onPointerUp());
        this._wheel.addEventListener("pointercancel", () => this._onPointerUp());

        this._manualIcon.addEventListener("click", () => this._setManualMode());
        this._autoIcon.addEventListener("click", () => this._setAutoMode());
    }

    private async _setManualMode(): Promise<void> {
        const entityId = this._config.entity;
        if (!this._hass || !entityId || !entityId.startsWith("climate.")) return;

        await this._hass.callService("climate", "set_hvac_mode", {
            entity_id: entityId,
            hvac_mode: "heat",
        });
    }

    private async _setAutoMode(): Promise<void> {
        const entityId = this._config.entity;
        if (!this._hass || !entityId || !entityId.startsWith("climate.")) return;

        await this._hass.callService("climate", "set_hvac_mode", {
            entity_id: entityId,
            hvac_mode: "auto",
        });
    }

    private _roundToStep(value: number): number {
        const step = this._config.step ?? 0.5;
        return Math.round(value / step) * step;
    }

    private _clamp(value: number): number {
        const min = this._config.min ?? 10;
        const max = this._config.max ?? 30;
        const rounded = this._roundToStep(value);
        return Math.min(max, Math.max(min, Number(rounded.toFixed(2))));
    }

    private _formatValue(value: number, includeUnit = false): string {
        const step = this._config.step ?? 0.5;
        const decimals = step % 1 === 0 ? 0 : 1;
        const txt = Number(value).toFixed(decimals);
        return includeUnit ? `${txt}${this._config.units}` : txt;
    }

    private _getTemperatureColor(value: number): string {
        if (!Number.isFinite(value)) return "#ffffff";
        if (value < 5) return "#42a5f5";
        if (value < 12) return "#64b5f6";
        if (value < 18) return "#ffb74d";
        if (value < 24) return "#ff8a65";
        return "#ef5350";
    }

    private _getHumidityColor(value: number): string {
        if (!Number.isFinite(value)) return "#ffffff";
        if (value >= 40 && value <= 60) return "#66bb6a";
        if ((value >= 30 && value < 40) || (value > 60 && value <= 70)) return "#ffb74d";
        return "#ef5350";
    }

    private _getRoomIconForName(name: string): string | null {
        const n = String(name || "").trim().toLowerCase();

        if (n === "living room") return "living_room.png";
        if (n === "bed room" || n === "bedroom") return "bed_room.png";
        if (n === "office" || n === "study") return "office.png";
        if (n === "dining room") return "dining_room.png";
        if (n === "kitchen" || n === "utility" || n === "utility room") return "kitchen.png";

        return null;
    }

    private _getTargetValue(): number | null {
        if (!this._hass || !this._config) return null;

        const entityId = this._config.entity || this._config.input_entity;
        if (!entityId) return null;

        const st = this._hass.states[entityId];
        if (!st) return null;

        if (entityId.startsWith("climate.")) {
            const val = Number(st.attributes?.temperature);
            return Number.isFinite(val) ? this._clamp(val) : null;
        }

        if (this._config.input_entity || entityId.startsWith("number.")) {
            const val = Number(st.state);
            return Number.isFinite(val) ? this._clamp(val) : null;
        }

        return null;
    }

    private _getCurrentValue(): number | null {
        if (!this._hass || !this._config) return null;

        if (this._config.entity && this._config.entity.startsWith("climate.")) {
            const st = this._hass.states[this._config.entity];
            if (!st) return null;

            const val = Number(st.attributes?.current_temperature);
            return Number.isFinite(val) ? this._clamp(val) : null;
        }

        if (this._config.current_entity) {
            const st = this._hass.states[this._config.current_entity];
            if (!st) return null;

            const val = Number(st.state);
            return Number.isFinite(val) ? this._clamp(val) : null;
        }

        return null;
    }

    private _getSimpleState(entityId?: string): string | null {
        if (!entityId || !this._hass) return null;
        const st = this._hass.states[entityId];
        if (!st) return null;
        return st.state;
    }

    private _polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
        const rad = (angle - 90) * Math.PI / 180;
        return {
            x: cx + r * Math.cos(rad),
            y: cy + r * Math.sin(rad),
        };
    }

    private _describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
        const start = this._polar(cx, cy, r, endAngle);
        const end = this._polar(cx, cy, r, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
    }

    private _valueToAngle(value: number): number {
        const min = this._config.min ?? 10;
        const max = this._config.max ?? 30;
        const startAngle = 225;
        const endAngle = 495;
        const ratio = (value - min) / (max - min);
        return startAngle + ratio * (endAngle - startAngle);
    }

    private _startEditing(): void {
        this._editing = true;
        if (this._pendingValue === null) {
            this._pendingValue = this._getTargetValue();
        }
    }

    private _scheduleCommit(): void {
        if (this._commitTimer !== null) {
            window.clearTimeout(this._commitTimer);
        }
        this._commitTimer = window.setTimeout(
            () => this._commitPendingValue(),
            this._config.commit_delay ?? 5000
        );
    }

    private async _commitPendingValue(): Promise<void> {
        if (this._pendingValue === null) {
            this._editing = false;
            this._render();
            return;
        }

        const value = this._pendingValue;
        const entityId = this._config.entity || this._config.input_entity;

        if (!entityId) return;

        if (entityId.startsWith("climate.")) {
            await this._hass.callService("climate", "set_temperature", {
                entity_id: entityId,
                temperature: value,
            });
        } else if (this._config.input_entity) {
            await this._hass.callService("input_number", "set_value", {
                entity_id: this._config.input_entity,
                value,
            });
        } else if (entityId.startsWith("number.")) {
            await this._hass.callService("number", "set_value", {
                entity_id: entityId,
                value,
            });
        }

        this._editing = false;
        this._pendingValue = null;
        this._render();
    }

    private _changePendingBy(delta: number): void {
        this._startEditing();
        this._pendingValue = this._clamp((this._pendingValue ?? this._getTargetValue() ?? 20) + delta);
        this._render();
        this._scheduleCommit();
    }

    private _onWheel(ev: WheelEvent): void {
        ev.preventDefault();
        const step = this._config.step ?? 0.5;
        const delta = ev.deltaY < 0 ? -step : step;
        this._changePendingBy(delta);
    }

    private _onPointerDown(ev: PointerEvent): void {
        this._startEditing();
        this._dragging = true;
        this._dragStartY = ev.clientY;
        this._dragStartValue = this._pendingValue ?? this._getTargetValue() ?? 20;
        this._wheel.setPointerCapture(ev.pointerId);
        if (this._commitTimer !== null) {
            window.clearTimeout(this._commitTimer);
        }
    }

    private _onPointerMove(ev: PointerEvent): void {
        if (!this._dragging) return;

        const pxPerStep = 22;
        const step = this._config.step ?? 0.5;
        const deltaPx = ev.clientY - this._dragStartY;
        const stepsMoved = Math.round(deltaPx / pxPerStep);

        this._pendingValue = this._clamp(this._dragStartValue + stepsMoved * step);
        this._render();
    }

    private _onPointerUp(): void {
        if (!this._dragging) return;
        this._dragging = false;
        this._scheduleCommit();
    }

    private _renderCenter(currentValue: number, targetValue: number): void {
        let mainValue: number;
        let prevValue: number;
        let nextValue: number;

        if (this._editing) {
            mainValue = this._pendingValue ?? targetValue;
            prevValue = this._clamp(mainValue + (this._config.step ?? 0.5));
            nextValue = this._clamp(mainValue - (this._config.step ?? 0.5));
        } else {
            mainValue = currentValue;
            prevValue = this._clamp(mainValue + (this._config.step ?? 0.5));
            nextValue = this._clamp(mainValue - (this._config.step ?? 0.5));
        }

        this._mainEl.textContent = this._formatValue(mainValue, false);
        this._mainUnitEl.textContent = this._config.units ?? "\u00B0C";
        this._prevEl.textContent = this._formatValue(prevValue, true);
        this._nextEl.textContent = this._formatValue(nextValue, true);
    }

    private _renderTopRight(): void {
        const tempEntity = this._config.top_right_temperature_entity;
        const humidityEntity = this._config.top_right_humidity_entity;

        if (tempEntity) {
            const tempState = this._getSimpleState(tempEntity);
            if (tempState !== null && tempState !== "unknown" && tempState !== "unavailable") {
                const tempVal = Number(tempState);
                this._topRightTempValue.textContent = Number.isFinite(tempVal)
                    ? `${tempVal.toFixed(1)}\u00B0C`
                    : `${tempState}`;
                this._topRightTempRow.style.display = "flex";

                if (Number.isFinite(tempVal)) {
                    this._topRightTempIcon.style.backgroundColor = this._getTemperatureColor(tempVal);
                }
            } else {
                this._topRightTempRow.style.display = "none";
            }
        } else {
            this._topRightTempRow.style.display = "none";
        }

        if (humidityEntity) {
            const humidityState = this._getSimpleState(humidityEntity);
            if (humidityState !== null && humidityState !== "unknown" && humidityState !== "unavailable") {
                const humidityVal = Number(humidityState);
                this._topRightHumidityValue.textContent = Number.isFinite(humidityVal)
                    ? `${humidityVal.toFixed(0)}%`
                    : `${humidityState}`;
                this._topRightHumidityRow.style.display = "flex";

                if (Number.isFinite(humidityVal)) {
                    this._topRightHumidityIcon.style.backgroundColor = this._getHumidityColor(humidityVal);
                }
            } else {
                this._topRightHumidityRow.style.display = "none";
            }
        } else {
            this._topRightHumidityRow.style.display = "none";
        }
    }

    private _renderModeIcons(): void {
        const st = this._config.entity ? this._hass.states[this._config.entity] : null;
        const hvacMode = st?.state;
        const isManual = hvacMode === "heat";

        this._manualIconImg.src = isManual
            ? "/local/thermo_wheel_card/manual_on.png"
            : "/local/thermo_wheel_card/manual_off.png";

        this._autoIconImg.src = isManual
            ? "/local/thermo_wheel_card/auto_off.png"
            : "/local/thermo_wheel_card/auto_on.png";
    }

    private _renderRoomName(): void {
        const st = this._config.entity ? this._hass.states[this._config.entity] : null;
        const friendlyName = st?.attributes?.friendly_name || "";
        this._roomName.textContent = friendlyName;

        const iconFile = this._getRoomIconForName(friendlyName);

        if (iconFile) {
            this._roomIcon.src = `/local/thermo_wheel_card/${iconFile}`;
            this._roomIcon.style.display = "block";
        } else {
            this._roomIcon.style.display = "none";
            this._roomIcon.removeAttribute("src");
        }
    }

    private _render(): void {
        if (!this._hass || !this._config || !this.card) return;

        const currentValue = this._getCurrentValue();
        const targetValue = this._getTargetValue();

        if (currentValue === null || targetValue === null) return;

        const displayTarget = this._editing ? (this._pendingValue ?? targetValue) : targetValue;

        this._topValue.textContent = this._formatValue(displayTarget, false);

        const startAngle = 225;
        const endAngle = 495;
        this._arcBg.setAttribute("d", this._describeArc(150, 150, 118, startAngle, endAngle));

        const currentAngle = this._valueToAngle(currentValue);
        this._arcCurrent.setAttribute("d", this._describeArc(150, 150, 118, startAngle, currentAngle));

        const tickAngle = this._valueToAngle(displayTarget);
        const p1 = this._polar(150, 150, 104, tickAngle);
        const p2 = this._polar(150, 150, 132, tickAngle);
        this._tick.setAttribute("x1", `${p1.x}`);
        this._tick.setAttribute("y1", `${p1.y}`);
        this._tick.setAttribute("x2", `${p2.x}`);
        this._tick.setAttribute("y2", `${p2.y}`);

        this._renderCenter(currentValue, targetValue);
        this._renderTopRight();
        this._renderModeIcons();
        this._renderRoomName();

        const st = this._config.entity ? this._hass.states[this._config.entity] : null;
        const hvacAction = st?.attributes?.hvac_action;
        const heatingOn = hvacAction === "heating";
        const belowSetpoint = currentValue < targetValue;

        this._heatIcon.style.display = heatingOn ? "block" : "none";

        let gaugeColor = "#43a047"; // green
        if (heatingOn) {
            gaugeColor = "#8f2b22";   // red
        } else if (belowSetpoint) {
            gaugeColor = "#ff9800";   // amber
        }

        this._arcCurrent.setAttribute("stroke", gaugeColor);
    }
}

customElements.define("thermo-wheel-card", ThermoWheelCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "thermo-wheel-card",
    name: "Thermo Wheel Card",
    description: "Circular thermostat style card with swipe setpoint control",
});

export { };