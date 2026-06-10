const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node'); // بروتوكول الاتصال لـ Push/Pull
const Database = require('better-sqlite3');

class GitManager {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.dbPath = path.join(userDataPath, 'warehouse_system.sqlite');
        
        this.repoDir = path.join(userDataPath, 'CloudBackupRepo');
        this.sqlFilePath = path.join(this.repoDir, 'database_dump.sql');
    }

    // ==========================================
    // 1. التهيئة (Initialization)
    // ==========================================
    async init() {
        if (!fs.existsSync(this.repoDir)) {
            fs.mkdirSync(this.repoDir, { recursive: true });
        }

        const gitFolderPath = path.join(this.repoDir, '.git');
        if (!fs.existsSync(gitFolderPath)) {
            console.log('📦 جاري تهيئة مستودع Git محلي لأول مرة...');
            await git.init({ fs, dir: this.repoDir });
            
            // إنشاء ملف SQL أولي فارغ لكي يتعرف عليه Git
            fs.writeFileSync(this.sqlFilePath, '-- Initial Backup File\n');
            console.log('✅ تم تهيئة المستودع بنجاح.');
        }
    }

    // ==========================================
    // 2. تحويل القاعدة إلى ملف نصي (SQL Dump)
    // ==========================================
    generateSQLDump() {
        console.log('⏳ جاري تحويل قاعدة البيانات إلى ملف نصي...');
        const db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
        
        let sqlDump = "-- 📦 نسخة احتياطية لمنظومة المخازن\n";
        sqlDump += "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n";

        // جلب كل الجداول (تجاهل جداول النظام الخاصة بـ sqlite)
        const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

        for (const table of tables) {
            sqlDump += `${table.sql};\n`; // كتابة هيكل الجدول (Schema)

            // جلب بيانات الجدول
            const rows = db.prepare(`SELECT * FROM ${table.name}`).all();
            for (const row of rows) {
                const columns = Object.keys(row).join(', ');
                const values = Object.values(row).map(v => {
                    if (v === null) return 'NULL';
                    if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`; // حماية الفواصل العليا
                    return v;
                }).join(', ');
                
                sqlDump += `INSERT INTO ${table.name} (${columns}) VALUES (${values});\n`;
            }
            sqlDump += "\n";
        }

        sqlDump += "COMMIT;\nPRAGMA foreign_keys=ON;\n";
        db.close();

        // حفظ الملف النصي داخل مستودع Git
        fs.writeFileSync(this.sqlFilePath, sqlDump);
        console.log('✅ تم التفريغ النصي بنجاح!');
    }

    // ==========================================
    // 3. أخذ النسخة المحلية (Local Commit)
    // ==========================================
    async commitLocalBackup(commitMessage = 'نسخة احتياطية تلقائية') {
        try {
            // تحديث ملف الـ SQL
            this.generateSQLDump();

            // إضافة الملف لـ Git (git add)
            await git.add({ fs, dir: this.repoDir, filepath: 'database_dump.sql' });

            // توثيق التغيير (git commit)
            const sha = await git.commit({
                fs,
                dir: this.repoDir,
                author: { name: 'System AutoBackup', email: 'backup@cit.edu.ly' },
                message: commitMessage
            });
            
            console.log(`✅ تم حفظ النسخة المحلية بنجاح! Commit Hash: ${sha}`);
            return { success: true, sha };
        } catch (error) {
            console.error('❌ فشل الحفظ المحلي:', error);
            return { success: false, error };
        }
    }

    // ==========================================
    // 4. المزامنة مع السحابة (Push to GitHub) - النسخة المستقرة
    // ==========================================
    async pushToCloud(repoUrl, token) {
        try {
            console.log('⏳ جاري الرفع للسحابة...');
        
            // 1. التأكد من وجود remote
            try {
                const remotes = await git.listRemotes({ fs, dir: this.repoDir });
                const hasOrigin = remotes.some(r => r.remote === 'origin');
            
                if (!hasOrigin) {
                    await git.addRemote({
                        fs,
                        dir: this.repoDir,
                        remote: 'origin',
                        url: repoUrl
                    });
                    console.log('✅ تم إضافة remote origin');
                }
            } catch (remoteError) {
                console.log('⚠️ خطأ في remote:', remoteError.message);
                try {
                    // إزالة remote القديم إذا وجد
                    try {
                        await git.deleteRemote({ fs, dir: this.repoDir, remote: 'origin' });
                    } catch (e) {}
                
                    await git.addRemote({
                        fs,
                        dir: this.repoDir,
                        remote: 'origin',
                        url: repoUrl
                    });
                } catch (e) {
                    console.log('⚠️ فشل إعادة إنشاء remote:', e.message);
                }
            }

            // 2. الحصول على اسم الفرع الحالي بشكل آمن
            let currentBranch = null;
            try {
                currentBranch = await git.currentBranch({ fs, dir: this.repoDir });
                console.log(`📌 الفرع الحالي من git: ${currentBranch}`);
            
                // التحقق من أن currentBranch ليس HEAD أو قيمة غير صالحة
                if (!currentBranch || currentBranch === 'HEAD' || currentBranch.startsWith('refs/') || currentBranch.includes('HEAD')) {
                    console.log(`⚠️ فرع غير صالح: ${currentBranch}`);
                    currentBranch = null;
                }
            } catch (branchError) {
                console.log('⚠️ لا يمكن تحديد الفرع الحالي:', branchError.message);
                currentBranch = null;
            }
        
            // 3. إذا لم يكن هناك فرع صالح، نحاول إيجاد أو إنشاء فرع
            if (!currentBranch) {
                console.log('📌 لا يوجد فرع صالح، جاري البحث عن فروع موجودة...');
            
                // الحصول على قائمة الفروع المحلية
                let branches = [];
                try {
                    branches = await git.listBranches({ fs, dir: this.repoDir });
                    console.log(`🌿 الفروع المحلية الموجودة: ${branches.join(', ') || 'لا توجد فروع'}`);
                } catch (listError) {
                    console.log('⚠️ لا يمكن جلب قائمة الفروع');
                }
            
                // اختيار أول فرع موجود
                if (branches.length > 0) {
                    // تفضيل master أو main
                    if (branches.includes('master')) {
                        currentBranch = 'master';
                    } else if (branches.includes('main')) {
                        currentBranch = 'main';
                    } else {
                        currentBranch = branches[0];
                    }
                
                    try {
                        await git.checkout({ fs, dir: this.repoDir, ref: currentBranch });
                        console.log(`✅ تم التبديل إلى الفرع ${currentBranch}`);
                    } catch (checkoutError) {
                        console.log(`⚠️ فشل التبديل إلى ${currentBranch}:`, checkoutError.message);
                    }
                } else {
                    // لا توجد فروع، نقوم بإنشاء فرع جديد
                    console.log('📌 لا توجد فروع، جاري إنشاء فرع master...');
                    currentBranch = 'master';
                    try {
                        await git.branch({ fs, dir: this.repoDir, ref: currentBranch });
                        await git.checkout({ fs, dir: this.repoDir, ref: currentBranch });
                        console.log(`✅ تم إنشاء فرع ${currentBranch}`);
                    } catch (createError) {
                        console.error('❌ فشل إنشاء الفرع:', createError);
                        return { success: false, message: 'لا يمكن إنشاء فرع جديد في المستودع المحلي' };
                    }
                }
            }

            // 4. التحقق من وجود commits في المستودع المحلي
            let hasCommits = false;
            try {
                const commits = await git.log({ fs, dir: this.repoDir, depth: 1 });
                hasCommits = commits.length > 0;
                console.log(`📊 عدد الـ commits المحلية: ${commits.length}`);
            } catch (logError) {
                console.log('⚠️ لا يوجد commits محلية بعد');
                hasCommits = false;
            }

            if (!hasCommits) {
                console.log('📦 لا توجد commits، جاري إنشاء commit أولي...');
                const commitResult = await this.commitLocalBackup('النسخة الأولية للنظام');
                if (!commitResult.success) {
                    return { success: false, message: 'فشل في إنشاء commit أولي' };
                }
            }

            // 5. محاولة جلب التغييرات من الـ remote (إذا كانت موجودة)
            let remoteExists = false;
            let remoteBranch = null;
        
            for (const branch of ['master', 'main']) {
                try {
                    console.log(`🔍 محاولة جلب فرع ${branch} من الـ remote...`);
                    await git.fetch({
                        fs,
                        http,
                        dir: this.repoDir,
                        remote: 'origin',
                        ref: branch,
                        singleBranch: true,
                        depth: 1,
                        onAuth: () => ({ username: token })
                    });
                    remoteExists = true;
                    remoteBranch = branch;
                    console.log(`✅ تم العثور على فرع ${branch} في الـ remote`);
                    break;
                } catch (fetchError) {
                    // الـ remote فارغ أو لا يحتوي على هذا الفرع
                    if (fetchError.message?.includes('cannot find remote ref') || 
                        fetchError.message?.includes('remote error') ||
                        fetchError.data?.what === branch) {
                        console.log(`ℹ️ فرع ${branch} غير موجود في الـ remote (repo قد يكون فارغاً)`);
                    } else {
                        console.log(`⚠️ فشل في جلب فرع ${branch}:`, fetchError.message);
                    }
                }
            }

            // 6. دفع الفرع الحالي إلى الـ remote
            console.log(`📤 جاري دفع الفرع ${currentBranch} إلى المستودع البعيد...`);
        
            try {
                // إذا كان الـ remote موجود ولديه commits، نستخدم دفع عادي
                // إذا كان الـ remote فارغاً، نستخدم force push
                const pushOptions = {
                    fs,
                    http,
                    dir: this.repoDir,
                    remote: 'origin',
                    ref: currentBranch,
                    remoteRef: currentBranch,
                    onAuth: () => ({ username: token })
                };
            
                // إذا كان الـ remote فارغاً أو لا يحتوي على نفس الفرع، نستخدم force
                if (!remoteExists || !remoteBranch) {
                    pushOptions.force = true;
                    console.log('⚠️ استخدام force push لأن المستودع البعيد فارغ أو لا يحتوي على نفس الفرع');
                }
            
                await git.push(pushOptions);
            
                console.log(`✅ تم رفع الفرع ${currentBranch} إلى المستودع البعيد بنجاح`);
                return { success: true, message: `تم رفع الفرع ${currentBranch} إلى السحابة` };
            
            } catch (pushError) {
                console.error('❌ فشل الرفع:', pushError);
            
                // محاولة أخيرة: دفع مع force
                if (!pushOptions.force) {
                    try {
                        console.log('🔄 محاولة الدفع مع force...');
                        pushOptions.force = true;
                        await git.push(pushOptions);
                        console.log(`✅ تم رفع الفرع ${currentBranch} مع force بنجاح`);
                        return { success: true, message: `تم رفع الفرع ${currentBranch} إلى السحابة (force)` };
                    } catch (forceError) {
                        console.error('❌ فشل حتى مع force:', forceError);
                        return { success: false, message: `فشل الرفع: ${pushError.message}` };
                    }
                }
            
                return { success: false, message: `فشل الرفع: ${pushError.message}` };
            }
        
        } catch (error) {
            console.error('❌ فشل الرفع للسحابة:', error);
            return { success: false, message: error.message || 'فشل الرفع للسحابة' };
        }
    }    
    async checkRemoteStatus(repoUrl, token) {
        try {
            // محاولة جلب قائمة الفروع من الـ remote
            const remoteRefs = await git.listRemote({
                fs,
                http,
                dir: this.repoDir,
                remote: 'origin',
                url: repoUrl,
                onAuth: () => ({ username: token })
            });
      
            const branches = remoteRefs.filter(ref => ref.ref.startsWith('refs/heads/'));
            console.log(`🌿 الفروع الموجودة في الـ remote: ${branches.map(b => b.ref).join(', ')}`);
      
            return {
                hasBranches: branches.length > 0,
                branches: branches.map(b => b.ref.replace('refs/heads/', '')),
                isEmpty: branches.length === 0
            };
        } catch (error) {
            console.log('ℹ️ الـ remote فارغ أو لا يمكن الوصول إليه:', error.message);
            return { isEmpty: true, branches: [], hasBranches: false };
        }
    }
    // ==========================================
    // 5. جلب سجل النسخ (Git Log)
    // ==========================================
    async getHistory() {
        try {
            const commits = await git.log({ fs, dir: this.repoDir, depth: 50 }); // جلب آخر 50 نسخة
            return commits.map(c => ({
                commitId: c.oid.substring(0, 7), // رمز مختصر
                date: new Date(c.commit.author.timestamp * 1000).toLocaleString('ar-LY'),
                message: c.commit.message
            }));
        } catch (error) {
            console.log('لا يوجد سجل بعد.');
            return [];
        }
    }
    // ==========================================
    // 6. استرجاع قاعدة البيانات من Commit محدد
    // ==========================================
    async findFullCommitId(shortHash) {
        try {
            const commits = await git.log({ fs, dir: this.repoDir, depth: 100 });
            const found = commits.find(c => c.oid.startsWith(shortHash));
            if (found) {
                return found.oid;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    // ==========================================
    // 6. استرجاع قاعدة البيانات من Commit محدد
    // ==========================================
    async restoreFromCommit(commitId) {
        try {
            console.log(`⏳ جاري استرجاع النسخة من الـ Commit: ${commitId}`);

            // إذا كان commitId مختصراً (أقل من 40 خانة)، نحاول البحث عن الـ hash الكامل
            let fullCommitId = commitId;
            if (commitId.length < 40) {
                fullCommitId = await this.findFullCommitId(commitId);
                if (!fullCommitId) {
                    return { success: false, message: `لم يتم العثور على Commit بالمعرف: ${commitId}` };
                }
                console.log(`✅ تم العثور على الـ Commit الكامل: ${fullCommitId}`);
            }

            // 1. قراءة محتوى ملف SQL من الـ Commit المحدد
            let blob;
            try {
                const result = await git.readBlob({
                    fs,
                    dir: this.repoDir,
                    oid: fullCommitId,
                    filepath: 'database_dump.sql'
                });
                blob = result.blob;
            } catch (readError) {
                console.error('❌ خطأ في قراءة الملف من الـ Commit:', readError);
                return { success: false, message: `الملف database_dump.sql غير موجود في هذا الـ Commit` };
            }

            // تحويل البيانات الثنائية (Blob) إلى نص مقروء
            const sqlContent = Buffer.from(blob).toString('utf8');

            // التحقق من أن المحتوى ليس فارغاً
            if (!sqlContent || sqlContent.trim().length === 0) {
                return { success: false, message: 'ملف النسخة الاحتياطية فارغ أو تالف' };
            }

            // 2. حذف ملف قاعدة البيانات القديم (بعد التأكد من إغلاقه في main.js)
            if (fs.existsSync(this.dbPath)) {
                try {
                    fs.unlinkSync(this.dbPath);
                    console.log('✅ تم حذف قاعدة البيانات القديمة');
                } catch (unlinkError) {
                    console.error('❌ فشل حذف قاعدة البيانات القديمة:', unlinkError);
                    return { success: false, message: 'لا يمكن حذف قاعدة البيانات الحالية. تأكد من إغلاقها أولاً.' };
                }
            }

            // 3. بناء قاعدة بيانات جديدة وتنفيذ أوامر الـ SQL
            let newDb;
            try {
                newDb = new Database(this.dbPath);
                newDb.exec(sqlContent); // تنفيذ التفريغ دفعة واحدة
                console.log('✅ تم إعادة بناء قاعدة البيانات بنجاح!');
            } catch (dbError) {
                console.error('❌ خطأ في تنفيذ SQL:', dbError);
                return { success: false, message: 'فشل في استعادة قاعدة البيانات: ' + dbError.message };
            } finally {
                if (newDb) {
                    newDb.close();
                }
            }

            // 4. توثيق عملية الاسترجاع كحدث جديد في النظام
            try {
                await this.commitLocalBackup(`استرجاع النظام للنسخة الزمنية: ${commitId.substring(0,7)}`);
            } catch (commitError) {
                console.warn('⚠️ تحذير: فشل في توثيق عملية الاسترجاع:', commitError);
                // لا نمنع عملية الاسترجاع بسبب فشل التوثيق
            }

            return { success: true, message: 'تم استرجاع قاعدة البيانات بنجاح' };
      
        } catch (error) {
            console.error('❌ خطأ في عملية الاسترجاع:', error);
            return { success: false, message: error.message || 'حدث خطأ غير متوقع' };
        }
    }
}

module.exports = GitManager;
