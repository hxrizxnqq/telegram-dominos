// database.js - Система работы с базой данных SQLite
import sqlite3 from 'sqlite3';
import path from 'path';

// Путь к файлу базы данных
const DB_PATH = path.join(process.cwd(), 'bot_data.db');

// Получение текущего времени в польском часовом поясе
function getPolandTime() {
	const now = new Date();
	return new Date(now.toLocaleString("en-US", {timeZone: "Europe/Warsaw"}));
}

// Получение даты в формате YYYY-MM-DD для Polen
function getPolandDateString() {
	const polandTime = getPolandTime();
	return polandTime.toISOString().split('T')[0];
}

// Инициализация базы данных
function initializeDatabase() {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH, (err) => {
			if (err) {
				console.error('❌ Ошибка подключения к базе данных:', err.message);
				reject(err);
				return;
			}
			console.log('✅ Подключение к базе данных успешно');
		});

		// Создание таблицы пользователей
		db.serialize(() => {
			// Таблица пользователей
			db.run(`CREATE TABLE IF NOT EXISTS users (
				chat_id INTEGER PRIMARY KEY,
				username TEXT,
				first_seen TEXT NOT NULL,
				last_seen TEXT NOT NULL,
				total_interactions INTEGER DEFAULT 1
			)`, (err) => {
				if (err) {
					console.error('❌ Ошибка создания таблицы users:', err.message);
				} else {
					console.log('✅ Таблица users создана/проверена');
				}
			});

			// Таблица истории чаевых
			db.run(`CREATE TABLE IF NOT EXISTS tips_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				chat_id INTEGER,
				date TEXT NOT NULL,
				expected_sum REAL NOT NULL,
				received_sum REAL NOT NULL,
				tip_amount REAL NOT NULL,
				timestamp TEXT NOT NULL,
				FOREIGN KEY (chat_id) REFERENCES users (chat_id)
			)`, (err) => {
				if (err) {
					console.error('❌ Ошибка создания таблицы tips_history:', err.message);
				} else {
					console.log('✅ Таблица tips_history создана/проверена');
				}
			});

			// Таблица для сохранения текущих сумм пользователей
			db.run(`CREATE TABLE IF NOT EXISTS user_current_sums (
				chat_id INTEGER PRIMARY KEY,
				expected_sum REAL DEFAULT 0,
				received_sum REAL DEFAULT 0,
				last_input TEXT,
				last_updated TEXT,
				FOREIGN KEY (chat_id) REFERENCES users (chat_id)
			)`, (err) => {
				if (err) {
					console.error('❌ Ошибка создания таблицы user_current_sums:', err.message);
				} else {
					console.log('✅ Таблица user_current_sums создана/проверена');
				}
			});
		});

		db.close((err) => {
			if (err) {
				console.error('❌ Ошибка закрытия базы данных:', err.message);
				reject(err);
			} else {
				console.log('✅ База данных инициализирована');
				resolve();
			}
		});
	});
}

// Добавление или обновление пользователя
function trackUser(chatId, userInfo = {}) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);
		const polandTime = getPolandTime().toISOString();

		db.get("SELECT * FROM users WHERE chat_id = ?", [chatId], (err, row) => {
			if (err) {
				reject(err);
				return;
			}

			if (row) {
				// Обновляем существующего пользователя
				db.run(
					"UPDATE users SET last_seen = ?, total_interactions = total_interactions + 1, username = COALESCE(?, username) WHERE chat_id = ?",
					[polandTime, userInfo.username, chatId],
					function(err) {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					}
				);
			} else {
				// Добавляем нового пользователя
				db.run(
					"INSERT INTO users (chat_id, username, first_seen, last_seen, total_interactions) VALUES (?, ?, ?, ?, 1)",
					[chatId, userInfo.username, polandTime, polandTime],
					function(err) {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					}
				);
			}
		});

		db.close();
	});
}

// Получение статистики пользователей
function getUserStats() {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);
		const now = getPolandTime();
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
		const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

		db.serialize(() => {
			let stats = {};

			// Общее количество пользователей
			db.get("SELECT COUNT(*) as total FROM users", (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				stats.totalUsers = row.total;
			});

			// Активные сегодня
			db.get("SELECT COUNT(*) as active FROM users WHERE last_seen > ?", [oneDayAgo], (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				stats.activeToday = row.active;
			});

			// Активные за неделю
			db.get("SELECT COUNT(*) as active FROM users WHERE last_seen > ?", [oneWeekAgo], (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				stats.activeThisWeek = row.active;
			});

			// Общее количество взаимодействий
			db.get("SELECT SUM(total_interactions) as total FROM users", (err, row) => {
				if (err) {
					reject(err);
					return;
				}
				stats.totalInteractions = row.total || 0;
				resolve(stats);
			});
		});

		db.close();
	});
}

// Сохранение текущих сумм пользователя
function saveUserSums(chatId, expectedSum, receivedSum, lastInput) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);
		const polandTime = getPolandTime().toISOString();

		db.run(
			`INSERT OR REPLACE INTO user_current_sums 
			(chat_id, expected_sum, received_sum, last_input, last_updated) 
			VALUES (?, ?, ?, ?, ?)`,
			[chatId, expectedSum, receivedSum, lastInput, polandTime],
			function(err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			}
		);

		db.close();
	});
}

// Получение текущих сумм пользователя
function getUserSums(chatId) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);

		db.get(
			"SELECT * FROM user_current_sums WHERE chat_id = ?",
			[chatId],
			(err, row) => {
				if (err) {
					reject(err);
				} else {
					resolve(row || {
						expected_sum: 0,
						received_sum: 0,
						last_input: null
					});
				}
			}
		);

		db.close();
	});
}

// Добавление записи в историю чаевых
function addTipHistory(chatId, expectedSum, receivedSum) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);
		const polandTime = getPolandTime();
		const date = getPolandDateString();
		const tipAmount = receivedSum - expectedSum;

		db.run(
			`INSERT INTO tips_history 
			(chat_id, date, expected_sum, received_sum, tip_amount, timestamp) 
			VALUES (?, ?, ?, ?, ?, ?)`,
			[chatId, date, expectedSum, receivedSum, tipAmount, polandTime.toISOString()],
			function(err) {
				if (err) {
					reject(err);
				} else {
					resolve(this.lastID);
				}
			}
		);

		db.close();
	});
}

// Получение истории чаевых пользователя
function getUserTipHistory(chatId, days = 7) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);
		const polandTime = getPolandTime();
		const daysAgo = new Date(polandTime.getTime() - days * 24 * 60 * 60 * 1000);
		const dateLimit = daysAgo.toISOString().split('T')[0];

		db.all(
			`SELECT * FROM tips_history 
			WHERE chat_id = ? AND date >= ? 
			ORDER BY timestamp DESC`,
			[chatId, dateLimit],
			(err, rows) => {
				if (err) {
					reject(err);
				} else {
					resolve(rows || []);
				}
			}
		);

		db.close();
	});
}

// Сброс текущих сумм пользователя
function resetUserSums(chatId) {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(DB_PATH);

		db.run(
			"UPDATE user_current_sums SET expected_sum = 0, received_sum = 0, last_input = NULL WHERE chat_id = ?",
			[chatId],
			function(err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			}
		);

		db.close();
	});
}

export {
	initializeDatabase,
	trackUser,
	getUserStats,
	saveUserSums,
	getUserSums,
	addTipHistory,
	getUserTipHistory,
	resetUserSums
};
