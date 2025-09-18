const express = require('express');
    const cors = require('cors');
    const { PrismaClient } = require('@prisma/client');

    const prisma = new PrismaClient();
    const app = express();

    app.use(cors());
    app.use(express.json({ limit: '10mb' })); // Cho phép payload lớn

    // API: Lấy tất cả bệnh nhân
    app.get('/api/patients', async (req, res) => {
        try {
            const patients = await prisma.patient.findMany({
                include: {
                    diagnosis: true,
                    treatments: true,
                    imagingDiagnostics: true,
                    aiAnalysisHistory: true,
                    appointments: true,
                },
            });
            // Chuyển đổi các chuỗi JSON thành object
            const formattedPatients = patients.map(p => ({
                ...p,
                treatments: p.treatments.map(t => ({ ...t, labTest: JSON.parse(t.labTestJson) })),
                aiAnalysisHistory: p.aiAnalysisHistory.map(h => ({
                    ...h,
                    currentProtocols: JSON.parse(h.currentProtocolsJson),
                    supportingGuidelines: JSON.parse(h.supportingGuidelinesJson)
                }))
            }));
            res.json(formattedPatients);
        } catch (error) {
            console.error("Lỗi khi lấy danh sách bệnh nhân:", error);
            res.status(500).json({ error: "Không thể lấy dữ liệu bệnh nhân" });
        }
    });

    // API: Cập nhật bệnh nhân theo ID
    app.put('/api/patients/:id', async (req, res) => {
        const { id } = req.params;
        const patientData = req.body;

        try {
            const updatedPatient = await prisma.$transaction(async (tx) => {
                // 1. Cập nhật thông tin chính của bệnh nhân
                await tx.patient.update({
                    where: { id },
                    data: {
                        name: patientData.name,
                        dob: patientData.dob,
                        address: patientData.address,
                        phone: patientData.phone,
                        treatingDoctorId: patientData.treatingDoctorId,
                    },
                });

                // 2. Cập nhật hoặc tạo mới chẩn đoán
                if (patientData.diagnosis) {
                    await tx.diagnosis.upsert({
                        where: { patientId: id },
                        update: patientData.diagnosis,
                        create: { ...patientData.diagnosis, patientId: id },
                    });
                }

                // 3. Xóa và tạo lại các danh sách liên quan (cách đơn giản nhất)
                await tx.treatment.deleteMany({ where: { patientId: id } });
                await tx.treatment.createMany({
                    data: patientData.treatments.map(t => ({
                        ...t,
                        labTestJson: JSON.stringify(t.labTest), // Chuyển object thành chuỗi JSON
                    })),
                });
                
                await tx.appointment.deleteMany({ where: { patientId: id } });
                if (patientData.appointments && patientData.appointments.length > 0) {
                     await tx.appointment.createMany({ data: patientData.appointments.map(a => ({...a, patientId: id})) });
                }

                await tx.imagingDiagnostic.deleteMany({ where: { patientId: id } });
                 if (patientData.imagingDiagnostics && patientData.imagingDiagnostics.length > 0) {
                    await tx.imagingDiagnostic.createMany({ data: patientData.imagingDiagnostics.map(i => ({...i, patientId: id})) });
                }
               
                await tx.aIAnalysisHistoryItem.deleteMany({ where: { patientId: id } });
                if (patientData.aiAnalysisHistory && patientData.aiAnalysisHistory.length > 0) {
                     await tx.aIAnalysisHistoryItem.createMany({
                        data: patientData.aiAnalysisHistory.map(h => ({
                            ...h,
                            currentProtocolsJson: JSON.stringify(h.currentProtocols),
                            supportingGuidelinesJson: JSON.stringify(h.supportingGuidelines),
                        })),
                    });
                }

                return tx.patient.findUnique({ where: { id } });
            });

            res.json(updatedPatient);
        } catch (error) {
            console.error(`Lỗi khi cập nhật bệnh nhân ${id}:`, error);
            res.status(500).json({ error: `Không thể cập nhật bệnh nhân ${id}` });
        }
    });

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => console.log(`Server đang chạy tại cổng ${PORT}`));