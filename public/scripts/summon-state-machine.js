/* ===== 召喚系統狀態機 ===== */

(function() {
    'use strict';

    // 狀態定義
    const SummonState = {
        IDLE: 'idle',
        CHECKING_COST: 'checking_cost',
        ROLLING: 'rolling',
        ANIMATING: 'animating',
        SHOWING_RESULT: 'showing_result'
    };

    // 狀態機類別
    class SummonStateMachine {
        constructor() {
            this.state = SummonState.IDLE;
            this.currentCompanion = null;
            this.currentRarity = null;
        }

        /**
         * 檢查是否允許狀態轉換
         */
        canTransitionTo(newState) {
            const transitions = {
                [SummonState.IDLE]: [SummonState.CHECKING_COST],
                [SummonState.CHECKING_COST]: [SummonState.ROLLING, SummonState.IDLE],
                [SummonState.ROLLING]: [SummonState.ANIMATING],
                [SummonState.ANIMATING]: [SummonState.SHOWING_RESULT],
                [SummonState.SHOWING_RESULT]: [SummonState.IDLE]
            };

            const allowedStates = transitions[this.state] || [];
            return allowedStates.includes(newState);
        }

        /**
         * 執行狀態轉換
         */
        transition(newState, data = null) {
            if (!this.canTransitionTo(newState)) {
                console.error(`[狀態機] 非法轉換: ${this.state} -> ${newState}`);
                return false;
            }

            console.log(`[狀態機] ${this.state} -> ${newState}`);
            const oldState = this.state;
            this.state = newState;

            // 狀態轉換時的數據處理
            if (newState === SummonState.ROLLING && data) {
                this.currentCompanion = data.companion;
                this.currentRarity = data.rarity;
            }

            // 觸發狀態轉換事件
            this._emitStateChange(oldState, newState);

            return true;
        }

        /**
         * 觸發狀態改變事件
         */
        _emitStateChange(oldState, newState) {
            const event = new CustomEvent('summon-state-change', {
                detail: { oldState, newState, companion: this.currentCompanion }
            });
            window.dispatchEvent(event);
        }

        /**
         * 檢查是否處於閒置狀態
         */
        isIdle() {
            return this.state === SummonState.IDLE;
        }

        /**
         * 檢查是否正在召喚（向後相容）
         */
        isSummoning() {
            return this.state !== SummonState.IDLE;
        }

        /**
         * 獲取當前狀態
         */
        getState() {
            return this.state;
        }

        /**
         * 獲取當前召喚的角色資訊
         */
        getCurrentCompanion() {
            return this.currentCompanion;
        }

        /**
         * 獲取當前召喚的稀有度
         */
        getCurrentRarity() {
            return this.currentRarity;
        }

        /**
         * 重置狀態機
         */
        reset() {
            console.log(`[狀態機] 重置: ${this.state} -> ${SummonState.IDLE}`);
            this.state = SummonState.IDLE;
            this.currentCompanion = null;
            this.currentRarity = null;
        }

        /**
         * 強制設置狀態（僅用於錯誤恢復）
         */
        forceReset() {
            console.warn('[狀態機] 強制重置');
            this.reset();
        }
    }

    // 暴露到全域
    window.SummonState = SummonState;
    window.SummonStateMachine = SummonStateMachine;

})();
