//! Rust 后端最小 API（stdlib，零外部依赖）。
use std::io::{Read, Write};
use std::net::TcpListener;

fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).expect("bind");
    eprintln!("[rust-backend] :{port}");
    for stream in listener.incoming() {
        let mut stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut buf = [0u8; 1024];
        let _ = stream.read(&mut buf);
        let req = String::from_utf8_lossy(&buf);
        let body = if req.contains("GET /health ") {
            r#"{"status":"ok","service":"rust"}"#.to_string()
        } else {
            format!(r#"{{"service":"rust-backend","port":{port}}}"#)
        };
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
    }
}
