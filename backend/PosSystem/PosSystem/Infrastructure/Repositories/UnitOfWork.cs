using Microsoft.EntityFrameworkCore.Storage;
using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class UnitOfWork : IUnitOfWork
{
    private readonly PosSystemDbContext _context;

    public UnitOfWork(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IDbContextTransaction> BeginTransactionAsync()
    {
        return await _context.Database.BeginTransactionAsync();
    }

    public async Task SaveChangesAsync()
    {
        await _context.SaveChangesAsync();
    }
}
