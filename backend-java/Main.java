import com.sun.net.httpserver.*;
import java.io.*;
import java.net.*;

public class Main {
    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/health", exchange -> {
            respond(exchange, "{\"status\":\"ok\",\"service\":\"java\"}");
        });
        server.createContext("/", exchange -> {
            respond(exchange, "{\"service\":\"java-backend\",\"port\":" + port + "}");
        });
        server.start();
        System.out.println("[java-backend] :" + port);
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes();
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
