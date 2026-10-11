use std::sync::mpsc::{self, Sender};

// A dedicated thread keeps acquisition and release on the same OS thread,
// including on Windows where display power assertions are thread-local.
enum Request {
    Set(bool, Sender<Result<(), String>>),
    Release,
}

pub struct DisplayAwake(Sender<Request>);

impl DisplayAwake {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let mut assertion = None;
            for request in receiver {
                match request {
                    Request::Set(enabled, response) => {
                        let result = if enabled && assertion.is_none() {
                            keepawake::Builder::default()
                                .display(true)
                                .reason("Aktives Training")
                                .app_name("Fitness Glass")
                                .app_reverse_domain("at.ghinta.fitness-glass")
                                .create()
                                .map(|guard| assertion = Some(guard))
                                .map_err(|error| error.to_string())
                        } else {
                            if !enabled {
                                assertion = None;
                            }
                            Ok(())
                        };
                        let _ = response.send(result);
                    }
                    Request::Release => break,
                }
            }
            // Dropping the assertion restores normal display power management.
        });
        Self(sender)
    }

    pub fn release(&self) {
        let _ = self.0.send(Request::Release);
    }
}

#[tauri::command]
pub async fn set_display_awake(
    enabled: bool,
    state: tauri::State<'_, DisplayAwake>,
) -> Result<(), String> {
    let sender = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (response, receiver) = mpsc::channel();
        sender
            .send(Request::Set(enabled, response))
            .map_err(|error| error.to_string())?;
        receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| error.to_string())?
    })
    .await
    .map_err(|error| error.to_string())?
}
