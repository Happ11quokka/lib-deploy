물론이죠 ✅
아래는 당신이 지금까지 구축한 library_db 데이터베이스 전체 구조를
정리한 Markdown 문서 버전입니다.
(🧩 각 테이블의 역할, 관계, 핵심 SQL 구조를 포함합니다.)

⸻

📚 Library Database Schema (최종 버전)

🏗️ 데이터베이스 생성

CREATE DATABASE library_db;
USE library_db;

⸻

🎭 Role (사용자 권한 구분)

컬럼명 타입 제약조건 설명
role_id INT AUTO_INCREMENT, PK 권한 ID
role_name VARCHAR(50) NOT NULL, UNIQUE 사용자 권한 (예: ‘user’, ‘admin’)

CREATE TABLE Role (
role_id INT AUTO_INCREMENT PRIMARY KEY,
role_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO Role (role_name)
VALUES ('user'), ('admin');

⸻

👤 Admin (관리자 정보)

컬럼명 타입 제약조건 설명
admin_id INT AUTO_INCREMENT, PK 관리자 ID
admin_code CHAR(10) NOT NULL, UNIQUE 관리자 인증 코드 (학번 등)

CREATE TABLE Admin (
admin_id INT AUTO_INCREMENT PRIMARY KEY,
admin_code CHAR(10) NOT NULL UNIQUE
);

INSERT INTO Admin (admin_code)
VALUES ('2021085078');

⸻

👥 User (회원 정보)

컬럼명 타입 제약조건 설명
user_id INT AUTO_INCREMENT, PK 사용자 ID
user_name VARCHAR(100) NOT NULL, UNIQUE 사용자 이름
password VARCHAR(255) NOT NULL 사용자 비밀번호
role_id INT FK → Role(role_id) 권한 (일반 / 관리자)
admin_id INT FK → Admin(admin_id) 관리자 계정일 경우 연결

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
);

⸻

✍️ Author (저자 정보)

컬럼명 타입 제약조건 설명
author_id INT AUTO_INCREMENT, PK 저자 ID
author_name VARCHAR(100) NOT NULL, UNIQUE 저자 이름

CREATE TABLE Author (
author_id INT AUTO_INCREMENT PRIMARY KEY,
author_name VARCHAR(100) NOT NULL UNIQUE
);

⸻

🗂️ Category (카테고리 정보)

컬럼명 타입 제약조건 설명
category_id INT AUTO_INCREMENT, PK 카테고리 ID
category_name VARCHAR(100) NOT NULL, UNIQUE 카테고리명
admin_id INT FK → Admin(admin_id) 생성한 관리자

CREATE TABLE Category (
category_id INT AUTO_INCREMENT PRIMARY KEY,
category_name VARCHAR(100) NOT NULL UNIQUE,
admin_id INT DEFAULT NULL,
FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
ON DELETE SET NULL
ON UPDATE CASCADE
);

⸻

📘 Book (도서 기본 정보)

컬럼명 타입 제약조건 설명
book_id INT AUTO_INCREMENT, PK 도서 ID
title VARCHAR(255) NOT NULL 도서 제목
publisher VARCHAR(255) NULL 출판사
author_id INT FK → Author(author_id) 저자
quantity INT DEFAULT 1 보유 수량
available BOOLEAN DEFAULT TRUE 대출 가능 여부
admin_id INT FK → Admin(admin_id) 등록 관리자

CREATE TABLE Book (
book_id INT AUTO_INCREMENT PRIMARY KEY,
title VARCHAR(255) NOT NULL,
publisher VARCHAR(255),
author_id INT,
quantity INT DEFAULT 1,
available BOOLEAN DEFAULT TRUE,
admin_id INT DEFAULT NULL,
FOREIGN KEY (author_id) REFERENCES Author(author_id)
ON DELETE SET NULL
ON UPDATE CASCADE,
FOREIGN KEY (admin_id) REFERENCES Admin(admin_id)
ON DELETE SET NULL
ON UPDATE CASCADE
);

⸻

📚 BookCategory (도서–카테고리 연결 테이블)

컬럼명 타입 제약조건 설명
book_id INT FK → Book(book_id) 도서 ID
category_id INT FK → Category(category_id) 카테고리 ID
PRIMARY KEY (book_id, category_id) 복합키 중복 방지

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
);

⸻

📦 BookCopy (도서 복사본 관리)

컬럼명 타입 제약조건 설명
book_id INT FK → Book(book_id) 도서 ID
copy_no INT 복합키, PK 복사본 번호
status ENUM DEFAULT ‘available’ 상태 (‘available’, ‘borrowed’, ‘lost’, ‘reserved’)

CREATE TABLE BookCopy (
book_id INT NOT NULL,
copy_no INT NOT NULL,
status ENUM('available', 'borrowed', 'lost', 'reserved') DEFAULT 'available',
PRIMARY KEY (book_id, copy_no),
FOREIGN KEY (book_id) REFERENCES Book(book_id)
ON DELETE CASCADE
ON UPDATE CASCADE
);

⸻

🧾 BorrowRecord (대출/반납 기록)

컬럼명 타입 제약조건 설명
record_id INT AUTO_INCREMENT, PK 대출 기록 ID
user_id INT FK → User(user_id) 대출자
book_id INT FK → Book(book_id) 도서 ID
copy_no INT FK → BookCopy(copy_no) 복사본 번호
borrow_date DATE NOT NULL 대출일
return_date DATE NULL 반납일

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
);

⸻

📊 BookStatistics (인기 도서/통계 정보)

컬럼명 타입 제약조건 설명
stat_id INT AUTO_INCREMENT, PK 통계 ID
book_id INT FK → Book(book_id) 도서 ID
category_id INT FK → Category(category_id) 카테고리 ID
period_start DATE NOT NULL 기간 시작
period_end DATE NOT NULL 기간 종료
borrow_count INT DEFAULT 0 대출 횟수

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
);

⸻

⏰ OverdueView (연체 조회용 뷰)

컬럼명 설명
record_id 대출 기록 ID
user_name 사용자 이름
title 도서 제목
days_borrowed 대출 경과 일수
status ‘OK’ / ‘OVERDUE’

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

⸻

🧑‍💼 ManagesMember (관리자–회원 관리 관계)

컬럼명 타입 제약조건 설명
admin_id INT FK → Admin(admin_id) 관리하는 관리자
user_id INT FK → User(user_id) 관리되는 사용자
PRIMARY KEY (admin_id, user_id) 복합키 중복 방지

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
);

⸻

🧩 전체 테이블 목록

구분 테이블명 역할 요약
권한/인증 Role, Admin, User 사용자 및 관리자 관리
도서 관련 Author, Book, Category, BookCategory, BookCopy 도서/카테고리/복사본 관리
대출/통계 BorrowRecord, BookStatistics, OverdueView 대출, 반납, 인기 도서, 연체 확인
관리자 기능 ManagesMember 회원 관리 관계

⸻

✅ 현재까지 완성된 library_db 스키마 구조

📘 총 12개 엔터티 (11개 테이블 + 1개 뷰)
완벽하게 정규화된 도서관 관리 시스템 구조입니다.
