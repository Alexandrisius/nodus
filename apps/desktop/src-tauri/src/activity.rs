//! Детектор активности пользователя (фидбек владельца 08.10, модель Telegram
//! Desktop `checkLastInput`): попапы гаснут, только если пользователь за ПК
//! — кликнул или нажал клавишу. Движение мыши активностью НЕ считается.
//!
//! Реализация: low-level хуки `WH_KEYBOARD_LL` / `WH_MOUSE_LL` — клики
//! фильтруются по коду сообщения (`WM_*BUTTONDOWN`; движение и пассивные
//! события отброшены). LL-хуки не требуют DLL и живут в своём потоке с
//! message loop. Колбэк только ставит метку времени — ввод не логируется.
//!
//! Коды сообщений — числами (winuser.h): 0x0100 WM_KEYDOWN, 0x0104
//! WM_SYSKEYDOWN, 0x0201/0204/0207/020B — L/R/M/X button down.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

static LAST_INPUT_MS: AtomicU64 = AtomicU64::new(0);
static START: OnceLock<Instant> = OnceLock::new();

/// Мс от старта процесса до последнего «настоящего» ввода (клик/клавиша).
pub fn last_input_ms() -> u64 {
    LAST_INPUT_MS.load(Ordering::Relaxed)
}

fn now_ms() -> u64 {
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// Мс от старта процесса (единая база с `last_input_ms` — для сравнений).
pub fn monotonic_ms() -> u64 {
    now_ms()
}

fn note_input() {
    LAST_INPUT_MS.store(now_ms(), Ordering::Relaxed);
}

/// Поднять хуки в выделенном потоке (один раз при старте приложения).
pub fn start() {
    std::thread::Builder::new()
        .name("activity-hooks".into())
        .spawn(run_hook_thread)
        .expect("поток activity-хуков");
}

fn run_hook_thread() {
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, HHOOK, WH_KEYBOARD_LL, WH_MOUSE_LL,
    };

    const WM_KEYDOWN: usize = 0x0100;
    const WM_SYSKEYDOWN: usize = 0x0104;
    const WM_LBUTTONDOWN: usize = 0x0201;
    const WM_RBUTTONDOWN: usize = 0x0204;
    const WM_MBUTTONDOWN: usize = 0x0207;
    const WM_XBUTTONDOWN: usize = 0x020B;

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        // Только нажатия кнопок: движение (0x0200) и hover-события не считаются.
        if matches!(
            wparam.0,
            WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN
        ) {
            note_input();
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if matches!(wparam.0, WM_KEYDOWN | WM_SYSKEYDOWN) {
            note_input();
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    unsafe {
        let mouse: HHOOK =
            SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0).expect("WH_MOUSE_LL");
        let kbd: HHOOK = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0)
            .expect("WH_KEYBOARD_LL");
        // Message loop потока обязателен: LL-хуки доставляются через него.
        let mut msg = std::mem::zeroed();
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&msg);
            let _ = DispatchMessageW(&msg);
        }
        let _ = UnhookWindowsHookEx(mouse);
        let _ = UnhookWindowsHookEx(kbd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn монотонная_база_не_убывает() {
        let a = monotonic_ms();
        std::thread::sleep(std::time::Duration::from_millis(2));
        assert!(monotonic_ms() >= a);
        // Без хуков метка ввода нулевая — «ввода не было» с самого старта.
        assert!(last_input_ms() <= monotonic_ms());
    }
}
