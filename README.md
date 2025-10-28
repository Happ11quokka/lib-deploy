# Library Management System Database Design

## 1. ERD (Entity-Relationship Diagram)

제공된 스키마 정보를 바탕으로 시스템의 핵심 엔티티와 관계를 시각화한 ERD입니다.

<img width="2132" height="1542" alt="image" src="https://github.com/user-attachments/assets/3c2285b1-a469-4bc7-b679-819f1667597f" />


## 2. 관계 스키마 (Relational Schema)

ERD를 기반으로 실제 테이블 간의 참조 관계(FK)를 명확하게 보여주는 스키마 다이어그램입니다.

<img width="1699" height="1301" alt="image" src="https://github.com/user-attachments/assets/f6199f59-01e1-4562-bbbf-3c0fda28bc49" />


## 3. 설계 의도 (Design Intent)

### (1) 각 엔티티(테이블)의 역할 및 필요성

#### A. 사용자 및 권한 (User & Access Control)

- **Role**: 사용자의 권한('user', 'admin')을 명확히 구분. role_id를 통해 User 테이블에 권한을 부여.
- **Admin**: 관리자 인증 코드(admin_code)를 저장. 관리자 계정 생성 시 이 코드와 일치해야만 admin 권한으로 가입 가능. (학번 2021085078 사용)
- **User**: 시스템의 주체. 로그인 정보(user_name, password)와 권한(role_id), 관리자 여부(admin_id)를 저장. 모든 대출/반납의 주체.
- **ManagesMember**: 관리자(Admin)와 사용자(User) 간의 '관리' 관계를 정의하는 N:M 테이블. (예: 특정 관리자가 특정 회원 그룹을 담당)

#### B. 도서 정보 (Book Information)

- **Author**: 저자 정보. Book과 1:N 관계. 저자 이름의 중복을 피하고 정규화.
- **Category**: 카테고리 정보. Book과 N:M 관계. 카테고리 이름의 중복을 피하고 정규화.
- **Book**: 도서의 원본 정보(제목, 출판사, 저자). 재고(quantity)를 관리하지만, 개별 대출은 BookCopy가 담당.
- **BookCategory**: Book과 Category의 N:M 관계를 해소하기 위한 연결(Bridge) 테이블. (한 책은 여러 카테고리, 한 카테고리는 여러 책)
- **BookCopy**: 약한 엔티티(Weak Entity). Book에 종속된 개별 복사본. (book_id, copy_no) 복합키로 식별. 실제 대출/반납의 대상이 되며 status('available', 'borrowed' 등)를 통해 실시간 상태 관리.
  - **필요성**: Book만으로는 "해리포터 1권" 10권 중 3번 책이 대출 중인지 알 수 없음. BookCopy가 개별 복사본을 식별해 대출/재고 관리를 정확하게 함.

#### C. 도서 이용 (Transaction)

- **BorrowRecord**: 핵심 트랜잭션 테이블. 사용자가(user_id) 어떤 복사본(book_id, copy_no)을 언제 빌리고(borrow_date) 언제 반납했는지(return_date) 기록.
- **OverdueView**: 연체 현황을 보여주는 논리적 뷰(View). BorrowRecord에서 return_date가 NULL이고 14일 이상 경과한 데이터를 실시간으로 조합. 물리적 저장소가 아님.

#### D. 관리 및 통계 (Logging & Statistics)

- **ManageLog**: 관리자(admin_id)가 도서(book_id)를 추가/삭제(action_type)한 이력을 저장. 감사(Audit) 및 추적용.
- **UserBorrowStats**: 집계 테이블. BorrowRecord 원본 데이터를 매번 GROUP BY하는 부담을 줄이기 위해, 기간별(월/분기) 사용자 대출 통계(총 대출, 연체 횟수, 선호 카테고리)를 미리 계산해 저장.
- **BookUsageStats**: 집계 테이블. 도서별 이용 통계(총 대출 횟수, 평균 대출 기간, 실시간 이용 가능 비율)를 미리 계산.
- **BookStatistics**: (문서 기반) 큐레이팅용 통계. BorrowRecord를 기반으로 기간별/카테고리별 인기 도서 차트를 생성하기 위한 데이터를 저장.

### (2) 엔티티 간 관계(Relation) 및 목적

- **User ↔ Role (N:1)**: User.role_id (FK) → Role.role_id
  - 목적: 사용자가 'user'인지 'admin'인지 구분. ON DELETE RESTRICT로 Role이 삭제되어 사용자의 권한이 불명확해지는 것을 방지.

- **User ↔ Admin (N:1, Nullable)**: User.admin_id (FK) → Admin.admin_id
  - 목적: 'admin' 권한으로 가입한 사용자를 특정 admin_code와 연결. 일반 사용자는 NULL. ON DELETE SET NULL로 관리자 코드가 삭제돼도 사용자 계정은 유지됨.

- **Book ↔ Author (N:1)**: Book.author_id (FK) → Author.author_id
  - 목적: 도서와 저자 연결. 저자명으로 검색 및 정규화.

- **Book ↔ Category (N:M)**: BookCategory (Bridge Table)
  - BookCategory.book_id (FK) → Book.book_id
  - BookCategory.category_id (FK) → Category.category_id
  - 목적: 한 책이 여러 카테고리(SF, 소설)에, 한 카테고리가 여러 책에 속하는 다대다 관계 구현.

- **Book ↔ BookCopy (1:N, Identifying)**: BookCopy.book_id (PK, FK) → Book.book_id
  - 목적: Book은 원본, BookCopy는 복사본. BookCopy는 Book 없이는 존재할 수 없는 약한 엔티티. ON DELETE CASCADE로 원본 책이 삭제되면 모든 복사본도 함께 삭제됨.

- **User ↔ BorrowRecord (1:N)**: BorrowRecord.user_id (FK) → User.user_id
  - 목적: 어떤 사용자가 어떤 대출 기록들을 가졌는지 추적. "내 대출 내역" 기능의 핵심.

- **BookCopy ↔ BorrowRecord (1:N)**: BorrowRecord.(book_id, copy_no) (Composite FK) → BookCopy.(book_id, copy_no)
  - 목적: (중요) Book이 아닌 특정 복사본(BookCopy)의 대출 이력을 추적. ON DELETE CASCADE로 복사본이 삭제되면 관련 대출 이력도 삭제됨.

- **Admin/User ↔ ManagesMember (N:M)**: Bridge Table
  - 목적: 관리자와 사용자 간의 관리 관계 설정.

- **Admin/Book ↔ ManageLog (N:M)**:
  - 목적: (어떤 관리자)가 (어떤 책)을 관리했는지 로그로 기록. ON DELETE SET NULL로 관리자나 책이 삭제돼도 로그 자체는 "Unknown"으로 남아 이력 추적이 가능.

- **User/Book ↔ Stats (1:N)**:
  - 목적: User 또는 Book을 기준으로 집계된 통계 데이터를 연결. ON DELETE CASCADE로 사용자나 책이 삭제되면 관련 통계도 자동 삭제.

## 4. 주요 기능 상세 설명 (Functional Breakdown)

### 1. 사용자 인증 (Login & Register)

**기능**: postLogin (로그인), postRegister (회원가입)  
**설계 의도**: 안전한 인증 및 권한 부여.

**핵심 구현 (postRegister)**:
- **트랜잭션**: `connection.beginTransaction()`으로 데이터 일관성 보장. (중간에 실패 시 rollback)
- **중복 검사**: User 테이블에서 user_name 중복 확인.
- **관리자 검증**: role === "admin"일 경우, 입력된 admin_code가 하드코딩된 adminCode("2021085078")와 일치하는지 검사.
- **권한 매핑**:
  - 'admin' → role_id=2, admin_id=1 (Admin 테이블의 PK 참조)
  - 'user' → role_id=1, admin_id=NULL
- **DB 삽입**: INSERT INTO User 실행.
- **결과**: 성공 시 commit, 실패 시 rollback.

**핵심 해결**:
- **DB 문법**: PostgreSQL($1)이 아닌 MySQL(?) 플레이스홀더 사용.
- **DB 연결**: `db.getConnection()`이 아닌 `db.pool.getConnection()`을 사용해 MySQL 풀(Pool)에서 커넥션을 가져오도록 수정.

### 2. 서적 검색 및 열람

**기능**: getBookListPage (도서 목록 및 검색)  
**설계 의도**: 다양한 조건으로 도서를 효율적으로 검색하고, 실시간 재고(대출 가능 수량)를 표시.

**핵심 SQL 설계**:
```sql
SELECT
  b.book_id AS id, b.title, a.author_name AS author,
  /* N:M 관계의 카테고리를 쉼표로 연결 */
  GROUP_CONCAT(DISTINCT c.category_name SEPARATOR ', ') AS categories,
  b.quantity AS total_quantity,
  /* BookCopy 테이블을 스캔하여 'available' 상태인 복사본만 카운트 */
  COUNT(CASE WHEN bc.status = 'available' THEN 1 END) AS available_quantity
FROM Book b
LEFT JOIN Author a ON b.author_id = a.author_id
LEFT JOIN BookCategory bcat ON b.book_id = bcat.book_id
LEFT JOIN Category c ON bcat.category_id = c.category_id
LEFT JOIN BookCopy bc ON b.book_id = bc.book_id
/* 동적 WHERE (제목, 저자, 카테고리 LIKE 검색) */
WHERE b.title LIKE ? OR a.author_name LIKE ? OR c.category_name LIKE ?
GROUP BY b.book_id
/* 동적 ORDER BY (정렬 기준) */
ORDER BY title ASC;
```

- **LEFT JOIN**: 정보가 없는(저자, 카테고리) 책도 누락되지 않도록 함.
- **GROUP_CONCAT**: 카테고리(N:M) 정보를 한 행으로 집약.
- **COUNT(CASE...)**: 복사본(1:N) 정보를 집계하여 "대출 가능 수량" 계산.

### 3. 대출 및 반납

#### A. 대출 (postBorrowBook - TODO 5)

**설계 의도**: 사용자의 대출 자격을 검증(연체, 한도)하고, 복사본의 상태를 변경.

**핵심 구현 (방어 로직)**:
- **연체 검사**: BorrowRecord에서 user_id가 일치하고, return_date가 NULL이며, borrow_date가 7일 이상 지난 기록이 있는지 확인. (있으면 대출 불가)
- **한도 검사**: BorrowRecord에서 user_id가 일치하고, return_date가 NULL인 기록이 3건 이상인지 확인. (있으면 대출 불가)
- **중복 대출 검사**: BorrowRecord에서 user_id와 book_id가 일치하고, return_date가 NULL인 기록 확인. (동일 책 중복 대출 불가)
- **복사본 상태 확인**: BookCopy에서 (book_id, copy_no)가 'available'인지 확인.

**트랜잭션 처리 (원자성)**:
- `INSERT INTO BorrowRecord (...) VALUES (?, ?, ?, CURDATE())`: 대출 기록 생성.
- `UPDATE BookCopy SET status = 'borrowed' WHERE ...`: 복사본 상태 변경.
- (참고: 문서 코드에는 명시적 트랜잭션이 없으나, 이 두 작업은 반드시 트랜잭션으로 묶여야 함)

#### B. 반납 (postReturnBook - TODO 6)

**설계 의도**: 본인의 대출 기록만 반납 처리하고, 복사본 상태를 원상 복구.

**핵심 구현**:
- **권한 검증**: record_id로 BorrowRecord를 조회하여 user_id가 현재 세션(req.session.userId)과 일치하는지 확인.
- **중복 반납 방지**: return_date가 NULL인지 확인.

**트랜잭션 처리 (원자성)**:
- `UPDATE BorrowRecord SET return_date = CURDATE() WHERE record_id = ?`: 반납일 기록.
- `UPDATE BookCopy SET status = 'available' WHERE ...`: 복사본 상태 'available'로 변경.

### 4. 서적 큐레이팅 (Charts)

**기능**: getChartPage (인기 도서 차트)  
**설계 의도**: BorrowRecord 데이터를 집계하여 기간별(최근 3개월) 인기 차트 제공.

**핵심 SQL 설계**:

**전체 인기 TOP 10**:
```sql
SELECT b.title, a.author_name, COUNT(br.record_id) AS borrow_count
FROM Book b
...
LEFT JOIN BorrowRecord br ON b.book_id = br.book_id
  /* 3개월 이내 대출 기록만 집계 */
  AND br.borrow_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
GROUP BY b.book_id
HAVING borrow_count > 0
ORDER BY borrow_count DESC, b.title ASC
LIMIT 10;
```

**카테고리별 인기 TOP 10**:
```sql
-- 위 쿼리와 동일한 구조에, WHERE 절 추가:
WHERE b.book_id IN (
  /* 이 카테고리에 속한 책들만 필터링 */
  SELECT book_id FROM BookCategory WHERE category_id = ?
)
```

- **카테고리 목록**: `SELECT ... FROM Category` (필터용).
- **최종 렌더링**: 3개 쿼리(전체 인기, 카테고리별 인기, 카테고리 목록) 결과를 조합하여 템플릿에 전달.

### 5. 서적 관리 (Admin)

#### A. 책 추가 (postAddBook - TODO 3 + 문제 해결)

**설계 의도**: 신규 도서를 등록하되, 중복(title)을 방지하고, 저자/카테고리/복사본을 원자적으로 생성.

**핵심 구현 (문제 해결 로직 포함)**:
1. **트랜잭션 시작**: `connection.beginTransaction()`.
2. **제목 정규화**: `sanitizedTitle = title.trim()`.
3. **저자 처리**: author_name으로 Author 조회. 없으면 INSERT 후 authorId 확보.
4. **도서 처리 (중복 방지)**:
   - `SELECT ... FROM Book WHERE title = ?`: 동일 제목 책 조회.
   - **(기존 책 존재 시)**: existingBookRows[0] 재사용. author_id가 비어있으면 갱신. quantity 누적.
   - **(신규 책일 시)**: INSERT INTO Book 후 bookId 확보.
5. **카테고리 처리 (N:M)**:
   - 입력된 categories 배열 순회.
   - `id:<n>` 형식은 파싱, 텍스트는 SELECT/INSERT로 categoryId 확보.
   - `INSERT INTO BookCategory (book_id, category_id)`로 연결. (중복 체크 포함)
6. **복사본 생성 (시리즈 유지)**:
   - `SELECT COALESCE(MAX(copy_no), 0) AS maxCopyNo FROM BookCopy WHERE book_id = ?`: 기존 최대 복사본 번호 조회.
   - nextCopyNo = maxCopyNo + 1부터 bookQuantity만큼 INSERT INTO BookCopy.
7. **로그 기록**: `INSERT INTO ManageLog ('add', +bookQuantity)`.
8. **완료**: `connection.commit()`.

#### B. 책 삭제 (postDeleteBookInstance - TODO 4)

**설계 의도**: 특정 복사본을 삭제. 복사본이 0개가 되면 원본도 삭제.

**핵심 구현**:
1. **검증**: bookInstanceId (예: 101)를 bookId(1)와 copyNo(1)로 파싱.
2. **대출 확인**: BorrowRecord에서 해당 복사본이 return_date IS NULL (대출 중)인지 확인. (대출 중이면 삭제 불가)
3. **트랜잭션**:
   - `DELETE FROM BookCopy WHERE book_id = ? AND copy_no = ?`: 복사본 삭제.
   - `SELECT COUNT(*)`: 남은 복사본 수 확인.
   - `if (count === 0)`: `DELETE FROM Book WHERE book_id = ?` (원본 삭제)
   - `else`: `UPDATE Book SET quantity = ?` (수량 갱신)
4. **로그 기록**: `INSERT INTO ManageLog ('remove', -1)`.

### 6. 추가 기능 (통계 집계)

#### A. 회원별 대출 통계 (refreshUserBorrowStats)

**설계 의도**: BorrowRecord 원본 데이터를 스캔하여 UserBorrowStats라는 집계 테이블을 주기적으로(월/분기) 갱신. (읽기 성능 향상)

**핵심 SQL 설계**:
```sql
/* 기존 통계 삭제 */
DELETE FROM UserBorrowStats WHERE period_start = ? AND period_end = ?;
/* 신규 통계 삽입 */
INSERT INTO UserBorrowStats (...)
SELECT
  u.user_id,
  COUNT(br.record_id) AS total_borrowed,
  /* 7일 이상 연체 건수 계산 (미반납/반납 모두 고려) */
  COALESCE(SUM(CASE
    WHEN br.return_date IS NULL AND DATEDIFF(?, br.borrow_date) >= 7 THEN 1
    WHEN br.return_date IS NOT NULL AND DATEDIFF(br.return_date, br.borrow_date) >= 7 THEN 1
    ELSE 0
  END), 0) AS overdue_count,
  /* 가장 많이 빌린 카테고리 (서브쿼리) */
  (
    SELECT c.category_name FROM BorrowRecord br2 ...
    WHERE br2.user_id = u.user_id AND br2.borrow_date BETWEEN ? AND ?
    GROUP BY c.category_name
    ORDER BY COUNT(*) DESC LIMIT 1
  ) AS favorite_category,
  ? AS period_start, ? AS period_end
FROM User u
LEFT JOIN BorrowRecord br ON u.user_id = br.user_id
  AND br.borrow_date BETWEEN ? AND ?
GROUP BY u.user_id
HAVING total_borrowed > 0 OR overdue_count > 0;
```

#### B. 도서 이용률 통계 (refreshBookUsageStats)

**설계 의도**: BookUsageStats 테이블을 갱신하여 도서별 이용 현황을 한눈에 파악.

**핵심 SQL 설계**:
```sql
DELETE FROM BookUsageStats;
INSERT INTO BookUsageStats (...)
SELECT
  b.book_id,
  COALESCE(br.borrow_count, 0), /* 총 대출 횟수 */
  br.avg_duration, /* 평균 대출 기간 */
  bc.available_ratio, /* 이용 가능 비율 */
  NOW()
FROM Book b
/* 서브쿼리 br: 도서별 대출 횟수 및 평균 대출 기간(미반납시 오늘 날짜 기준) 집계 */
LEFT JOIN (
  SELECT book_id, COUNT(*) AS borrow_count,
    ROUND(AVG(DATEDIFF(CASE WHEN return_date IS NULL THEN ? ELSE return_date END, borrow_date)), 2) AS avg_duration
  FROM BorrowRecord GROUP BY book_id
) AS br ON br.book_id = b.book_id
/* 서브쿼리 bc: 도서별 'available' 복사본 비율 집계 */
LEFT JOIN (
  SELECT book_id,
    ROUND(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS available_ratio
  FROM BookCopy GROUP BY book_id
) AS bc ON bc.book_id = b.book_id;
```

**설계 핵심**: Book 테이블을 기준으로 모든 책을 조회하고, BorrowRecord와 BookCopy에서 집계한 통계 데이터를 LEFT JOIN으로 결합합니다.
