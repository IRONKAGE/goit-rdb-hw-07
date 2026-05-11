import { writeLog } from './5_ConsoleLogger.js';
import uk from '../locales/uk.js';
import en from '../locales/en.js';

const translations = { uk, en };
let currentLang = localStorage.getItem('ide_lang') || 'uk';

export function initSnippetEngine(containerId) {
  const container = document.getElementById(containerId);
  const t = translations[currentLang];

  container.innerHTML = `
        <div class="w-[20%] glass flex flex-col gap-1 p-1.5 rounded h-full">
            <select id="lang-select" class="input-style text-[10px] w-full flex-grow font-bold cursor-pointer">
                <option value="csharp">C# (ADO.NET)</option>
                <option value="cpp">C++ (libpqxx)</option>
                <option value="dart">Dart</option>
                <option value="go">Go (database/sql)</option>
                <option value="java">Java (JDBC)</option>
                <option value="js">JavaScript (Node.js)</option>
                <option value="kotlin">Kotlin (Exposed)</option>
                <option value="php">PHP (PDO)</option>
                <option value="python" selected>Python (SQLAlchemy)</option>
                <option value="ruby">Ruby</option>
                <option value="rust">Rust (sqlx)</option>
                <option value="swift">Swift (GRDB)</option>
                <option value="ts">TypeScript (Prisma)</option>
            </select>

            <div class="flex items-center gap-1 w-full h-[30%]">
                <label id="label-imports" class="flex items-center justify-center gap-1.5 h-full px-2 border border-[var(--border)] bg-black/10 rounded cursor-pointer hover:bg-[var(--border)]/50 transition-colors shrink-0" title="${t.snip_imports_title}">
                    <input type="checkbox" id="check-imports" checked class="cursor-pointer scale-90 accent-[var(--accent)]">
                    <span id="label-imports-text" class="text-[9px] font-bold opacity-80 uppercase">${t.snip_imports}</span>
                </label>

                <button id="btn-copy-snip" class="btn-base text-[10px] uppercase font-bold transition-colors flex-grow h-full flex items-center justify-center">
                    ${t.snip_copy}
                </button>
            </div>
        </div>
        <div class="w-[80%] glass bg-black/30 p-2 relative rounded overflow-hidden h-full">
            <pre id="snippet-view" class="text-[11px] text-[var(--log-text)] h-full overflow-y-auto whitespace-pre-wrap font-mono"></pre>
        </div>
    `;

  const savedLang = localStorage.getItem('ide_snippet_lang') || 'python';
  const savedImports = localStorage.getItem('ide_snippet_imports') !== 'false'; // true за замовчуванням

  // Застосовуємо ці стани до UI
  const langSelect = document.getElementById('lang-select');
  const checkImports = document.getElementById('check-imports');

  langSelect.value = savedLang;
  checkImports.checked = savedImports;

  let currentSql = "SELECT * FROM sys_users LIMIT 10;";
  let currentEngine = 'postgres'; // Дефолтний рушій

  // --- МЕТАДАНІ РУШІЇВ (Роблять сніпети розумними) ---
  const dbMeta = {
    postgres: { port: 5432, pyPrefix: 'postgresql', jsLib: 'pg', goLib: 'github.com/lib/pq', goDrv: 'postgres', csLib: 'Npgsql', csConn: 'NpgsqlConnection', javaPrefix: 'postgresql' },
    mysql: { port: 3306, pyPrefix: 'mysql+pymysql', jsLib: 'mysql2/promise', goLib: 'github.com/go-sql-driver/mysql', goDrv: 'mysql', csLib: 'MySql.Data.MySqlClient', csConn: 'MySqlConnection', javaPrefix: 'mysql' },
    oracle: { port: 1521, pyPrefix: 'oracle+oracledb', jsLib: 'oracledb', goLib: 'github.com/sijms/go-ora/v2', goDrv: 'oracle', csLib: 'Oracle.ManagedDataAccess.Client', csConn: 'OracleConnection', javaPrefix: 'oracle:thin' },
    mssql: { port: 1433, pyPrefix: 'mssql+pymssql', jsLib: 'mssql', goLib: 'github.com/denisenkom/go-mssqldb', goDrv: 'sqlserver', csLib: 'System.Data.SqlClient', csConn: 'SqlConnection', javaPrefix: 'sqlserver' },
    default: { port: 0, pyPrefix: 'sqlite', jsLib: 'db-client', goLib: 'database/sql', goDrv: 'db', csLib: 'System.Data.SqlClient', csConn: 'SqlConnection', javaPrefix: 'unknown' }
  };

  // --- СЛОВНИК ШАБЛОНІВ ---
  const snippetGenerators = {
    csharp: (sql, showImports, meta) => {
      const imports = showImports ? `using System;\nusing ${meta.csLib};\n\n` : ``;
      return `${imports}public async Task FetchData() {
    string query = @"
${sql.split('\n').map(l => '        ' + l).join('\n')}
    ";

    try {
        using (${meta.csConn} conn = new ${meta.csConn}("Server=localhost,${meta.port};Database=stand_db;User Id=admin;Password=secret;")) {
            await conn.OpenAsync();
            using (var cmd = conn.CreateCommand()) {
                cmd.CommandText = query;
                using (var reader = await cmd.ExecuteReaderAsync()) {
                    while (await reader.ReadAsync()) {
                        Console.WriteLine($"Row data: {reader[0]}");
                    }
                }
            }
        }
    } catch (Exception ex) {
        Console.WriteLine($"Database error: {ex.Message}");
    }
}`;
    },

    cpp: (sql, showImports) => {
      // C++ зазвичай юзає libpqxx для Postgres, для інших рушіїв бібліотеки сильно відрізняються
      const imports = showImports ? `#include <iostream>\n#include <pqxx/pqxx>\n\n` : ``;
      return `${imports}void executeQuery() {
    std::string query = R"(
${sql.split('\n').map(l => '        ' + l).join('\n')}
    )";

    try {
        pqxx::connection c("dbname=stand_db user=admin password=secret hostaddr=127.0.0.1");
        pqxx::work w(c);
        pqxx::result r = w.exec(query);

        for (auto const &row : r) {
            std::cout << "Row found: " << row[0].c_str() << std::endl;
        }
    } catch (const std::exception &e) {
        std::cerr << "Database error: " << e.what() << std::endl;
    }
}`;
    },

    dart: (sql, showImports, meta) => {
      const imports = showImports ? `import 'package:postgres/postgres.dart'; // Змініть залежно від БД\n\n` : ``;
      return `${imports}Future<void> fetchUsers() async {
  final query = '''
${sql.split('\n').map(l => '    ' + l).join('\n')}
  ''';

  try {
    final connection = PostgreSQLConnection('localhost', ${meta.port}, 'stand_db', username: 'admin', password: 'secret');
    await connection.open();

    List<List<dynamic>> results = await connection.query(query);
    for (final row in results) {
      print('Row found: $row');
    }

    await connection.close();
  } catch (e) {
    print('Database error: $e');
  }
}`;
    },

    go: (sql, showImports, meta) => {
      const imports = showImports ? `import (\n\t"database/sql"\n\t"fmt"\n\t"log"\n\n\t_ "${meta.goLib}"\n)\n\n` : ``;
      return `${imports}func fetchUsers() {
\tquery := \`
${sql.split('\n').map(l => '\t\t' + l).join('\n')}
\t\`

\tdb, err := sql.Open("${meta.goDrv}", "user=admin password=secret dbname=stand_db port=${meta.port} sslmode=disable")
\tif err != nil {
\t\tlog.Fatalf("Connection error: %v", err)
\t}
\tdefer db.Close()

\trows, err := db.Query(query)
\tif err != nil {
\t\tlog.Fatalf("Database error: %v", err)
\t}
\tdefer rows.Close()

\tfor rows.Next() {
\t\tfmt.Println("Row processed")
\t}
}`;
    },

    java: (sql, showImports, meta) => {
      const imports = showImports ? `import java.sql.Connection;\nimport java.sql.DriverManager;\nimport java.sql.Statement;\nimport java.sql.ResultSet;\nimport java.sql.SQLException;\n\n` : ``;
      return `${imports}public void executeQuery() {
    String url = "jdbc:${meta.javaPrefix}://localhost:${meta.port}/stand_db";
    String query = """
${sql.split('\n').map(l => '        ' + l).join('\n')}
    """;

    try (Connection conn = DriverManager.getConnection(url, "admin", "secret");
         Statement stmt = conn.createStatement();
         ResultSet rs = stmt.executeQuery(query)) {

        while (rs.next()) {
            System.out.println("Row data: " + rs.getString(1));
        }
    } catch (SQLException e) {
        System.err.println("Database error: " + e.getMessage());
    }
}`;
    },

    js: (sql, showImports, meta) => {
      const imports = showImports ? `const db = require('${meta.jsLib}');\n\n` : ``;
      return `${imports}async function executeQuery() {
  const query = \`
${sql.split('\n').map(l => '    ' + l).join('\n')}
  \`;

  try {
    // Note: Connection logic varies slightly between pg, mysql2, and mssql
    const connection = await db.createConnection({
        host: 'localhost', port: ${meta.port}, user: 'admin', password: 'secret', database: 'stand_db'
    });

    const [rows] = await connection.query(query);
    console.log("Rows:", rows);

    await connection.end();
  } catch (err) {
    console.error("Database error:", err.message);
  }
}`;
    },

    kotlin: (sql, showImports, meta) => {
      const imports = showImports ? `import java.sql.SQLException\nimport org.jetbrains.exposed.sql.Database\nimport org.jetbrains.exposed.sql.transactions.transaction\nimport org.jetbrains.exposed.sql.transactions.TransactionManager\n\n` : ``;
      return `${imports}fun runQuery() {
    val url = "jdbc:${meta.javaPrefix}://localhost:${meta.port}/stand_db"
    Database.connect(url, driver = "...", user = "admin", password = "secret")

    val query = """
${sql.split('\n').map(l => '        ' + l).join('\n')}
    """.trimIndent()

    transaction {
        try {
            val connection = TransactionManager.current().connection
            connection.prepareStatement(query, false).use { statement ->
                statement.executeQuery().use { rs ->
                    while (rs.next()) {
                        println("Row data: \${rs.getString(1)}")
                    }
                }
            }
        } catch (e: SQLException) {
            println("Database Error: \${e.message}")
        }
    }
}`;
    },

    php: (sql, showImports, meta) => {
      const imports = showImports ? `<?php\n\n` : ``;
      // PDO DSN changes based on engine
      const dsn = currentEngine === 'oracle' ? 'oci:dbname=localhost/stand_db' : `${currentEngine === 'mssql' ? 'sqlsrv:Server' : currentEngine}:host=localhost;port=${meta.port};dbname=stand_db`;
      return `${imports}function executeQuery() {
    $dsn = "${dsn}";
    $query = <<<SQL
${sql.split('\n').map(l => '        ' + l).join('\n')}
SQL;

    try {
        $pdo = new PDO($dsn, "admin", "secret");
        $stmt = $pdo->query($query);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            print_r($row);
        }
    } catch (PDOException $e) {
        echo "Database error: " . $e->getMessage() . "\\n";
    }
}`;
    },

    python: (sql, showImports, meta) => {
      const indentedSql = sql.split('\n').map(line => `        ${line}`).join('\n');
      const imports = showImports ? `from sqlalchemy import create_engine, text\nfrom sqlalchemy.exc import SQLAlchemyError\n\n` : ``;
      return `${imports}try:
    # Connect to the specific DB engine
    db_url = "${meta.pyPrefix}://admin:secret@localhost:${meta.port}/stand_db"
    engine = create_engine(db_url)

    query = text("""
${indentedSql}
    """)

    with engine.connect() as conn:
        result = conn.execute(query)
        for row in result:
            print(f"Row data: {row}")

except SQLAlchemyError as e:
    print(f"Database error occurred: {e}")`;
    },

    ruby: (sql, showImports, meta) => {
      const imports = showImports ? `require '${meta.jsLib === 'pg' ? 'pg' : 'db_driver'}'\n\n` : ``;
      return `${imports}def execute_query
  query = <<~SQL
${sql.split('\n').map(l => '    ' + l).join('\n')}
  SQL

  begin
    # Connection format depends on the specific gem used
    conn = DBClient.connect(host: 'localhost', port: ${meta.port}, dbname: 'stand_db', user: 'admin', password: 'secret')
    result = conn.exec(query)

    result.each do |row|
      puts "Row found: #{row}"
    end
  rescue => e
    puts "Database error: #{e.message}"
  end
end`;
    },

    rust: (sql, showImports, meta) => {
      // Rust sqlx підтримує Postgres, MySQL, SQLite, MSSQL.
      const poolType = currentEngine === 'mysql' ? 'MySqlPool' : currentEngine === 'mssql' ? 'MssqlPool' : 'PgPool';
      const imports = showImports ? `use sqlx::${currentEngine === 'mysql' ? 'mysql' : currentEngine === 'mssql' ? 'mssql' : 'postgres'}::${poolType};\n\n` : ``;
      return `${imports}async fn fetch_users() -> Result<(), sqlx::Error> {
    let pool = ${poolType}::connect("${currentEngine}://admin:secret@localhost:${meta.port}/stand_db").await?;

    let query = r#"
${sql.split('\n').map(l => '        ' + l).join('\n')}
    "#;

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await?;

    for row in rows {
        println!("Row processed");
    }

    Ok(())
}`;
    },

    swift: (sql, showImports) => {
      const imports = showImports ? `import Foundation\nimport GRDB // Підключення залежить від типу БД\n\n` : ``;
      return `${imports}func fetchUsers() async {
    let query = """
    ${sql.split('\n').join('\n    ')}
    """

    do {
        // Конфігурація пулу з'єднань
        let results = try await Database.execute(query)

        for row in results {
            print("Row found: \\(row)")
        }
    } catch {
        print("Database error: \\(error.localizedDescription)")
    }
}`;
    },

    ts: (sql, showImports, meta) => {
      const imports = showImports ? `import { PrismaClient } from '@prisma/client';\n\n// Prisma automatically uses the DB engine defined in schema.prisma (e.g. provider = "${currentEngine === 'mssql' ? 'sqlserver' : currentEngine}")\nconst prisma = new PrismaClient();\n\n` : ``;
      return `${imports}async function executeQuery() {
  try {
    const data = await prisma.$queryRaw\`
      ${sql.split('\n').join('\n      ')}
    \`;

    console.log("Query returned:", data);
    return data;
  } catch (error) {
    console.error("Database operation failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}`;
    }
  };

  langSelect.addEventListener('change', (e) => {
    localStorage.setItem('ide_snippet_lang', e.target.value);
    updateSnippet();
  });

  checkImports.addEventListener('change', (e) => {
    localStorage.setItem('ide_snippet_imports', e.target.checked);
    updateSnippet();
  });

  const updateSnippet = () => {
    const lang = document.getElementById('lang-select').value;
    const showImports = document.getElementById('check-imports').checked;
    const view = document.getElementById('snippet-view');

    const generator = snippetGenerators[lang] || snippetGenerators['python'];
    const meta = dbMeta[currentEngine] || dbMeta['default'];

    view.innerText = generator(currentSql.trim(), showImports, meta);
  };

  // --- МАГІЯ: Витягуємо рушій із вибраної бази ---
  document.addEventListener('db-selected', (e) => {
    const dbId = e.detail; // напр: "rdb_mysql_1234"
    if (dbId) {
      const parts = dbId.split('_'); // ["rdb", "mysql", "1234"]
      if (parts.length > 1) {
        currentEngine = parts[1]; // Тепер currentEngine = "mysql"
      }
    } else {
      currentEngine = 'postgres';
    }
    updateSnippet(); // Одразу перемальовуємо сніпет
  });

  document.addEventListener('lang-changed', (e) => {
    currentLang = e.detail;
    const loc = translations[currentLang];

    document.getElementById('label-imports-text').innerText = loc.snip_imports;
    document.getElementById('label-imports').title = loc.snip_imports_title;
    document.getElementById('btn-copy-snip').innerText = loc.snip_copy;
  });

  document.addEventListener('code-changed', (e) => {
    currentSql = e.detail;
    updateSnippet();
  });

  document.getElementById('lang-select').addEventListener('change', updateSnippet);
  document.getElementById('check-imports').addEventListener('change', updateSnippet);

  document.getElementById('btn-copy-snip').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('snippet-view').innerText);
    writeLog(translations[currentLang].snip_copied, "text-[var(--accent)] font-bold");
  });

  updateSnippet();
}
