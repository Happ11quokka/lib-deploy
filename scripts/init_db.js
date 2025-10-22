const db = require("../config/db");
// 날짜 포맷팅
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const refreshUserBorrowStats = async (periodStartDate, periodEndDate) => {
  const periodStart = formatDate(periodStartDate);
  const periodEnd = formatDate(periodEndDate);

  const today = new Date();
  let evaluationPoint = today;
  if (evaluationPoint > periodEndDate) {
    evaluationPoint = periodEndDate;
  } else if (evaluationPoint < periodStartDate) {
    evaluationPoint = periodEndDate;
  }
  const evaluationDate = formatDate(evaluationPoint);

  await db.query(
    `
      DELETE FROM UserBorrowStats
      WHERE period_start = ? AND period_end = ?
    `,
    [periodStart, periodEnd]
  );

  await db.query(
    `
      INSERT INTO UserBorrowStats (user_id, total_borrowed, overdue_count, favorite_category, period_start, period_end)
      SELECT 
        u.user_id,
        COUNT(br.record_id) AS total_borrowed,
        COALESCE(SUM(CASE
          WHEN br.record_id IS NULL THEN 0
          WHEN br.return_date IS NULL AND DATEDIFF(?, br.borrow_date) >= 7 THEN 1
          WHEN br.return_date IS NOT NULL AND DATEDIFF(br.return_date, br.borrow_date) >= 7 THEN 1
          ELSE 0
        END), 0) AS overdue_count,
        (
          SELECT c.category_name
          FROM BorrowRecord br2
          JOIN BookCategory bc2 ON br2.book_id = bc2.book_id
          JOIN Category c ON bc2.category_id = c.category_id
          WHERE br2.user_id = u.user_id
            AND br2.borrow_date BETWEEN ? AND ?
          GROUP BY c.category_name
          ORDER BY COUNT(*) DESC, c.category_name ASC
          LIMIT 1
        ) AS favorite_category,
        ? AS period_start,
        ? AS period_end
      FROM User u
      LEFT JOIN BorrowRecord br ON br.user_id = u.user_id
        AND br.borrow_date BETWEEN ? AND ?
      GROUP BY u.user_id
      HAVING total_borrowed > 0 OR overdue_count > 0
    `,
    [
      evaluationDate,
      periodStart,
      periodEnd,
      periodStart,
      periodEnd,
      periodStart,
      periodEnd,
    ]
  );
};

const refreshBookUsageStats = async (evaluationDate = new Date()) => {
  const evaluationDay = formatDate(evaluationDate);

  await db.query(`DELETE FROM BookUsageStats`);

  await db.query(
    `
      INSERT INTO BookUsageStats (book_id, borrow_count, avg_borrow_duration, available_ratio, last_updated)
      SELECT
        b.book_id,
        COALESCE(br.borrow_count, 0) AS borrow_count,
        br.avg_duration,
        bc.available_ratio,
        NOW() AS last_updated
      FROM Book b
      LEFT JOIN (
        SELECT
          book_id,
          COUNT(*) AS borrow_count,
          ROUND(
            AVG(
              DATEDIFF(
                CASE
                  WHEN return_date IS NOT NULL THEN return_date
                  ELSE ?
                END,
                borrow_date
              )
            ),
            2
          ) AS avg_duration
        FROM BorrowRecord
        GROUP BY book_id
      ) AS br ON br.book_id = b.book_id
      LEFT JOIN (
        SELECT
          book_id,
          ROUND(
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(*), 0),
            2
          ) AS available_ratio
        FROM BookCopy
        GROUP BY book_id
      ) AS bc ON bc.book_id = b.book_id
    `,
    [evaluationDay]
  );
};

const initDB = async () => {
  try {
    // Drop existing tables in the correct order
    console.log("Deleting existing tables...");

    // TODO: 기존 테이블 제거하는 코드를 작성하세요.
    // 외래 키 제약 조건 때문에 뷰와 테이블을 특정 순서로 삭제한다
    await db.query("DROP VIEW IF EXISTS OverdueView");
    await db.query("DROP TABLE IF EXISTS ManagesMember");
    await db.query("DROP TABLE IF EXISTS BookStatistics");
    await db.query("DROP TABLE IF EXISTS BookUsageStats");
    await db.query("DROP TABLE IF EXISTS UserBorrowStats"); // 추가 2: UserBorrowStats 테이블 삭제
    await db.query("DROP TABLE IF EXISTS BorrowRecord");
    await db.query("DROP TABLE IF EXISTS ManageLog"); // 추가 1: ManageLog 테이블 삭제
    await db.query("DROP TABLE IF EXISTS BookCopy");
    await db.query("DROP TABLE IF EXISTS BookCategory");
    await db.query("DROP TABLE IF EXISTS Book");
    await db.query("DROP TABLE IF EXISTS Category");
    await db.query("DROP TABLE IF EXISTS Author");
    await db.query("DROP TABLE IF EXISTS User");
    await db.query("DROP TABLE IF EXISTS Admin");
    await db.query("DROP TABLE IF EXISTS Role");

    // Create new tables
    console.log("Creating new tables...");

    // TODO: 설계한 스키마에 맞춰 새로운 테이블을 생성하는 코드를 작성하세요.
    // Role
    await db.query(`
      CREATE TABLE Role (
        role_id INT AUTO_INCREMENT PRIMARY KEY,
        role_name VARCHAR(50) NOT NULL UNIQUE
      )
    `);

    // Admin
    await db.query(`
      CREATE TABLE Admin (
        admin_id INT AUTO_INCREMENT PRIMARY KEY,
        admin_code CHAR(10) NOT NULL UNIQUE
      )
    `);

    // User
    await db.query(`
      CREATE TABLE User (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role_id INT NOT NULL,
        admin_id INT DEFAULT NULL,
        FOREIGN KEY (role_id) REFERENCES Role(role_id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      )
    `);

    // Author
    await db.query(`
      CREATE TABLE Author (
        author_id INT AUTO_INCREMENT PRIMARY KEY,
        author_name VARCHAR(100) NOT NULL UNIQUE
      )
    `);

    // Category
    await db.query(`
      CREATE TABLE Category (
        category_id INT AUTO_INCREMENT PRIMARY KEY,
        category_name VARCHAR(100) NOT NULL UNIQUE,
        admin_id INT DEFAULT NULL,
        FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      )
    `);

    // Book
    await db.query(`
      CREATE TABLE Book (
        book_id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        publisher VARCHAR(255),
        author_id INT,
        admin_id INT DEFAULT NULL,
        quantity INT DEFAULT 1,
        available BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (author_id) REFERENCES Author(author_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,
        FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      )
    `);

    // ManageLog
    await db.query(`
      CREATE TABLE ManageLog (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT DEFAULT NULL,
        book_id INT DEFAULT NULL,
        book_title VARCHAR(255) NOT NULL,
        action_type ENUM('add', 'remove') NOT NULL,
        change_amount INT NOT NULL,
        action_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE,
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      )
    `);

    // BookCategory
    await db.query(`
      CREATE TABLE BookCategory (
        book_id INT NOT NULL,
        category_id INT NOT NULL,
        PRIMARY KEY (book_id, category_id),
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        FOREIGN KEY (category_id) REFERENCES Category(category_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    // BookCopy
    await db.query(`
      CREATE TABLE BookCopy (
        book_id INT NOT NULL,
        copy_no INT NOT NULL,
        status ENUM('available', 'borrowed', 'lost', 'reserved') DEFAULT 'available',
        PRIMARY KEY (book_id, copy_no),
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    // BorrowRecord
    await db.query(`
      CREATE TABLE BorrowRecord (
        record_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        book_id INT NOT NULL,
        copy_no INT NOT NULL,
        borrow_date DATE NOT NULL,
        return_date DATE DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES User(user_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        FOREIGN KEY (book_id, copy_no) REFERENCES BookCopy(book_id, copy_no)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    // UserBorrowStats
    await db.query(`
      CREATE TABLE UserBorrowStats (
        stat_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        total_borrowed INT DEFAULT 0,
        overdue_count INT DEFAULT 0,
        favorite_category VARCHAR(100) DEFAULT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        CONSTRAINT fk_user_borrow_stats_user
          FOREIGN KEY (user_id) REFERENCES User(user_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
        CONSTRAINT uq_user_borrow_stats_period
          UNIQUE (user_id, period_start, period_end)
      )
    `);

    // BookStatistics
    await db.query(`
      CREATE TABLE BookStatistics (
        stat_id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        category_id INT DEFAULT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        borrow_count INT DEFAULT 0,
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        FOREIGN KEY (category_id) REFERENCES Category(category_id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      )
    `);

    // BookUsageStats
    await db.query(`
      CREATE TABLE BookUsageStats (
        stat_id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        borrow_count INT DEFAULT 0,
        avg_borrow_duration DECIMAL(6, 2) DEFAULT NULL,
        available_ratio DECIMAL(5, 2) DEFAULT NULL,
        last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_book_usage_stats_book
          FOREIGN KEY (book_id) REFERENCES Book(book_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
        CONSTRAINT uq_book_usage_stats_book
          UNIQUE (book_id)
      )
    `);

    // ManagesMember
    await db.query(`
      CREATE TABLE ManagesMember (
        admin_id INT NOT NULL,
        user_id INT NOT NULL,
        PRIMARY KEY (admin_id, user_id),
        FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        FOREIGN KEY (user_id) REFERENCES User(user_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )
    `);

    // View: OverdueView
    await db.query(`
      CREATE OR REPLACE VIEW OverdueView AS
      SELECT 
        br.record_id,
        u.user_name,
        b.title,
        DATEDIFF(CURDATE(), br.borrow_date) AS days_borrowed,
        CASE 
          WHEN br.return_date IS NULL AND DATEDIFF(CURDATE(), br.borrow_date) > 14 THEN 'OVERDUE'
          ELSE 'OK'
        END AS status
      FROM BorrowRecord br
      JOIN User u ON br.user_id = u.user_id
      JOIN Book b ON br.book_id = b.book_id;
    `);

    // Insert initial data
    console.log("Inserting initial data...");

    await db.query(`
      INSERT INTO Role (role_name)
      VALUES ('user'), ('admin')
    `);

    await db.query(`
      INSERT INTO Admin (admin_code)
      VALUES ('2021085078')
    `);

    await db.query(`
      INSERT INTO User (user_name, password, role_id, admin_id)
      VALUES 
        ('testuser1', 'password123', 1, NULL),
        ('testuser2', 'password123', 1, NULL),
        ('overdueuser', 'password123', 1, NULL)
    `);

    await db.query(`
      INSERT INTO Author (author_name)
      VALUES 
        ('J.R.R Tolkien'),
        ('Isaac Asimov'),
        ('Agatha Christie')
    `);

    await db.query(`
      INSERT INTO Category (category_name, admin_id)
      VALUES 
        ('Fantasy', 1),
        ('Science Fiction', 1),
        ('Mystery', 1)
    `);

    await db.query(`
      INSERT INTO Book (title, publisher, author_id, quantity, admin_id)
      VALUES 
        ('The Hobbit', 'George Allen & Unwin', 1, 3, 1),
        ('Foundation', 'Gnome Press', 2, 2, 1),
        ('Murder on the Orient Express', 'Collins Crime Club', 3, 2, 1)
    `);

    await db.query(`
      INSERT INTO BookCategory (book_id, category_id)
      VALUES 
        (1, 1),
        (2, 2),
        (3, 3)
    `);

    await db.query(`
      INSERT INTO BookCopy (book_id, copy_no, status)
      VALUES 
        (1, 1, 'available'),
        (1, 2, 'available'),
        (1, 3, 'borrowed'),
        (2, 1, 'available'),
        (2, 2, 'borrowed'),
        (3, 1, 'available'),
        (3, 2, 'available')
    `);

    await db.query(`
      INSERT INTO ManageLog (admin_id, book_id, book_title, action_type, change_amount)
      VALUES 
        (1, 1, 'The Hobbit', 'add', 3),
        (1, 2, 'Foundation', 'add', 2),
        (1, 3, 'Murder on the Orient Express', 'add', 2)
    `);

    await db.query(`
      INSERT INTO BorrowRecord (user_id, book_id, copy_no, borrow_date, return_date)
      VALUES 
        (3, 1, 3, DATE_SUB(CURDATE(), INTERVAL 10 DAY), NULL),
        (2, 2, 2, DATE_SUB(CURDATE(), INTERVAL 3 DAY), NULL)
    `);

    // UserBorrowStats 테이블에 월간 + 분기별 통계 자동 집계
    console.log("Aggregating initial user borrow stats...");

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const firstDayOfQuarter = new Date(
      now.getFullYear(),
      currentQuarter * 3,
      1
    );
    const lastDayOfQuarter = new Date(
      now.getFullYear(),
      currentQuarter * 3 + 3,
      0
    );

    await refreshUserBorrowStats(firstDayOfMonth, lastDayOfMonth);
    await refreshUserBorrowStats(firstDayOfQuarter, lastDayOfQuarter);
    console.log("Aggregating initial book usage stats...");
    await refreshBookUsageStats(now);

    console.log("Database initialization completed successfully.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    db.pool.end();
  }
};

initDB();
