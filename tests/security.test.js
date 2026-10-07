const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bcrypt = require("bcrypt");
const request = require("supertest");

const sourceDatabasePath = path.join(__dirname, "..", "blog.db");
const originalDatabasePath = process.env.BLOG_DB_PATH;
let testDirectory;
let db;
let app;

function run(query, parameters = []) {
  return new Promise((resolve, reject) => {
    db.run(query, parameters, function (error) {
      if (error) {
        reject(error);
      } else {
        resolve(this);
      }
    });
  });
}

function all(query, parameters = []) {
  return new Promise((resolve, reject) => {
    db.all(query, parameters, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function get(query, parameters = []) {
  return new Promise((resolve, reject) => {
    db.get(query, parameters, (error, row) => {
      if (error) {
        reject(error);
      } else {
        resolve(row);
      }
    });
  });
}

describe("Security Checks", () => {
  beforeEach(() => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "blog-security-"));
    const testDatabasePath = path.join(testDirectory, "blog.db");
    fs.copyFileSync(sourceDatabasePath, testDatabasePath);
    process.env.BLOG_DB_PATH = testDatabasePath;

    jest.resetModules();
    db = require("../database");
    app = require("../app");
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.close((error) => (error ? reject(error) : resolve()));
    });
    if (originalDatabasePath === undefined) {
      delete process.env.BLOG_DB_PATH;
    } else {
      process.env.BLOG_DB_PATH = originalDatabasePath;
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
    jest.resetModules();
  });

  test("A01: unauthenticated users cannot access the admin page", async () => {
    const response = await request(app).get("/admin");

    expect(response.status).toBe(403);
    expect(response.text).toContain("Access denied");
  });

  test("A01: authenticated non-admin users cannot access the admin page", async () => {
    const username = "regular-security-test-user";
    const sessionId = "regular-security-test-session";
    await run(
      "INSERT INTO users (username, password, sessionId) VALUES (?, ?, ?)",
      [username, bcrypt.hashSync("unused-test-password", 10), sessionId],
    );

    const response = await request(app)
      .get("/admin")
      .set("Cookie", `sessionId=${sessionId}`);

    expect(response.status).toBe(403);
    expect(response.text).toContain("Access denied");
  });

  test("A05: SQL injection input is treated as a literal login name", async () => {
    const injection = "admin' OR '1'='1' --";
    const password = "known-test-password";
    const columns = await all("PRAGMA table_info(users)");
    const allowedValues = ["TEXT", "VARCHAR", "CHAR"];
    const usernameColumn = columns.find((column) => column.name === "username");

    const response = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ username: injection, password });

    expect(allowedValues).toContain(usernameColumn.type);
    expect(
      response.headers["set-cookie"].some((cookie) =>
        cookie.includes("sessionId="),
      ),
    ).toBe(true);
    expect(response.status).toBe(302);
    expect(response.text).toBe("Found. Redirecting to /");
  });

  test("A05: stored HTML in posts is escaped before rendering", async () => {
    const sessionId = "valid-test-session";
    const title = '<script>alert("xss")</script>';
    await run(
      "INSERT INTO users (username, password, sessionId) VALUES (?, ?, ?)",
      ["security-test", bcrypt.hashSync("unused-test-password", 10), sessionId],
    );
    await run("INSERT INTO posts (title, content) VALUES (?, ?)", [
      title,
      "<img src=x onerror=alert(1)>",
    ]);

    const response = await request(app)
      .get("/")
      .set("Cookie", `sessionId=${sessionId}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain("&lt;script&gt;");
    expect(response.text).toContain("&lt;img");
    expect(response.text).not.toContain("<script>alert");
  });

  test("A02: registration stores a bcrypt hash instead of the plaintext password", async () => {
    const username = `new-security-test-user-${Date.now()}`;
    const password = "correct-horse-battery-staple";
    const response = await request(app)
      .post("/auth/register")
      .type("form")
      .send({ username, password });

    const user = await get("SELECT password FROM users WHERE username = ?", [
      username,
    ]);
    expect(response.status).toBe(302);
    expect(user.password).not.toBe(password);
    expect(bcrypt.compareSync(password, user.password)).toBe(true);
  });

  test("A04: responses set security headers and do not disclose Express", async () => {
    const response = await request(app).get("/auth/login");

    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
  test("A01: a user cannot retrieve new posts without authentication", async () => {
    const response = await request(app).get("/new-post");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/auth/login");
  });
  test("A01: a user cannot create new posts without authentication", async () => {
    const response = await request(app).post("/new-post");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/auth/login");
  });
  test("A05: a user with the same username as another user but different password can be registered", async () => {
    const username = "admin";
    const password = "known-test-password1";

    const user = await get("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    isMatch = user && bcrypt.compareSync(password, user.password);
    expect(isMatch).toBe(false);
  });
  test("A05: a user with the same credentials cannot be registered twice", async () => {
    const username = "admin";
    const password = "known-test-password1";

    const response = await request(app)
      .post("/auth/register")
      .type("form")
      .send({ username, password });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/auth/login");
  });

  test("A01: a user cannot access the admin page if their username isn't 'admin'", async () => {
    const username = "adm1n";
    const password = "known-test-password";

    const response = await request(app)
      .get("/admin")
      .send({ username: username, password: password });

    expect(response.status).toBe(403);
    expect(response.text).toContain("Access denied");
  });
});
