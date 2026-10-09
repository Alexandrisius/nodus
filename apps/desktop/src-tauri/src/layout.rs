//! Единый раскладчик стека попапов (#254): один проход решает всё —
//! порядок по счёту показа (новейший у ПОЛА), позиции КУМУЛЯТИВНО по
//! фактическим высотам (разросшийся «Ответить» приподнимает верхние —
//! дыр и наездов не бывает), окно «Скрыть все» строго над ПОЛНЫМ столбиком
//! с тем же зазором, что между карточками (фидбек владельца 08.10).

use tauri::{AppHandle, Manager, PhysicalPosition};

use crate::popups::{
    build_popup_window, stack, ActivePopup, GAP, HIDE_ALL_H, HIDE_ALL_LABEL, MARGIN, MAX_STACK,
    POPUP_H, POPUP_H_REPLY, POPUP_W,
};

/// ЕДИНЫЙ раскладчик стека (фидбек 08.10): один проход решает всё —
/// порядок по счёту показа (новейший у ПОЛА), позиции КУМУЛЯТИВНО по
/// фактическим высотам (разросшийся «Ответить» приподнимает верхние —
/// дыр и наездов не бывает), «Скрыть все» только над ПОЛНЫМ столбиком
/// (смысл — быстро убрать 3 попапа; фидбек 08.10 п.4).
pub(crate) fn reposition_all(app: &AppHandle) {
    use tauri::LogicalSize;
    let plan: Vec<(String, i32, i32, f64)> = {
        let cursor = app.cursor_position().ok();
        let monitor = cursor
            .and_then(|c| app.monitor_from_point(c.x, c.y).ok())
            .flatten();
        let Some(monitor) = monitor else { return };
        let scale = monitor.scale_factor();
        let wa = monitor.work_area();
        let px = |v: f64| (v * scale).round() as i32;
        let x = wa.position.x + wa.size.width as i32 - px(POPUP_W) - px(MARGIN);
        // Низ стека — над панелью задач; идём снизу вверх: новейший первым.
        let mut bottom = wa.position.y + wa.size.height as i32 - px(MARGIN);
        let mut s = stack(app);
        let mut order: Vec<&mut ActivePopup> = s.active.iter_mut().collect();
        order.sort_by(|a, b| b.counter.cmp(&a.counter));
        let mut plan = Vec::new();
        for p in order.iter_mut() {
            let h = if p.replying { POPUP_H_REPLY } else { POPUP_H };
            let ph = px(h);
            let y = bottom - ph;
            plan.push((p.label.clone(), x, y, h));
            p.slot = plan.len() as u32 - 1;
            bottom = bottom - ph - px(GAP);
        }
        plan
    };
    for (label, x, y, h) in plan {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, h)));
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
    }
    place_hide_all(app);
}

/// Окно «Скрыть все»: РОВНО межпопапный зазор (та же арифметика кумутива),
/// живёт ТОЛЬКО при полном столбике. Создание/закрытие — под мьютексом
/// (hide_all_live): два reposition_all подряд успевали создать ОКНО-ДУБЛЬ,
/// которое вечно висело над стеком и ломало зазор.
fn place_hide_all(app: &AppHandle) {
    use tauri::LogicalSize;
    let action = {
        let cursor = app.cursor_position().ok();
        let Some(monitor) = cursor
            .and_then(|c| app.monitor_from_point(c.x, c.y).ok())
            .flatten()
        else {
            return;
        };
        let scale = monitor.scale_factor();
        let wa = monitor.work_area();
        let px = |v: f64| (v * scale).round() as i32;
        let x = wa.position.x + wa.size.width as i32 - px(POPUP_W) - px(MARGIN);
        let mut bottom = wa.position.y + wa.size.height as i32 - px(MARGIN);
        let mut s = stack(app);
        let mut order: Vec<&mut ActivePopup> = s.active.iter_mut().collect();
        order.sort_by(|a, b| b.counter.cmp(&a.counter));
        let mut top: Option<i32> = None;
        for p in order.iter() {
            let h = px(if p.replying { POPUP_H_REPLY } else { POPUP_H });
            top = Some(bottom - h);
            bottom = bottom - h - px(GAP);
        }
        let full = s.active.len() >= MAX_STACK as usize;
        // Окно уже существует (в т.ч. ещё закрывается после close_all) —
        // 'c' не создаём (дубль-лейбл упал бы в Err и потерял бы флаг).
        let hide_window_absent =
            s.hide_all_live && app.get_webview_window(HIDE_ALL_LABEL).is_none();
        if full && s.hide_all_live && hide_window_absent {
            s.hide_all_live = true;
            match top {
                Some(top) => ('c', x, top - px(GAP) - px(HIDE_ALL_H)),
                None => ('x', x, 0),
            }
        } else if !full && s.hide_all_live {
            s.hide_all_live = false;
            ('x', x, 0)
        } else if full {
            match top {
                Some(top) => ('m', x, top - px(GAP) - px(HIDE_ALL_H)),
                None => ('x', x, 0),
            }
        } else {
            ('x', x, 0)
        }
    };
    match action {
        ('x', _, _) => {
            if let Some(w) = app.get_webview_window(HIDE_ALL_LABEL) {
                let _ = w.close();
            }
        }
        (op, x, y) => {
            if op == 'c' {
                build_popup_window(app, HIDE_ALL_LABEL, HIDE_ALL_H);
            }
            if let Some(win) = app.get_webview_window(HIDE_ALL_LABEL) {
                let _ = win.set_size(tauri::Size::Logical(LogicalSize::new(POPUP_W, HIDE_ALL_H)));
                let _ = win.set_position(PhysicalPosition::new(x, y));
                let _ = win.show();
            }
        }
    }
}
